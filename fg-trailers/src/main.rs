mod app;
mod events;
mod supabase;
mod ui;
mod youtube;

use anyhow::{Context, Result};
use app::App;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use events::{handle_event, perform_refresh, perform_save, perform_set_active, Action};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::{
    io::{self, Stdout},
    panic,
    time::Duration,
};
use supabase::SupabaseClient;

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env from CWD then from fg-trailers/ (in case run from repo root).
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_filename("fg-trailers/.env");

    let supabase_url = std::env::var("SUPABASE_URL").unwrap_or_default();
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").unwrap_or_default();

    let client = SupabaseClient::new(supabase_url, service_role_key)
        .context("failed to construct Supabase client — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")?;

    install_panic_hook();
    let mut terminal = setup_terminal()?;
    let result = run_app(&mut terminal, client).await;
    restore_terminal(&mut terminal)?;
    result
}

fn setup_terminal() -> Result<Terminal<CrosstermBackend<Stdout>>> {
    enable_raw_mode().context("enable_raw_mode")?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture).context("enter alt screen")?;
    let backend = CrosstermBackend::new(stdout);
    Terminal::new(backend).context("Terminal::new")
}

fn restore_terminal(terminal: &mut Terminal<CrosstermBackend<Stdout>>) -> Result<()> {
    disable_raw_mode().ok();
    execute!(terminal.backend_mut(), LeaveAlternateScreen, DisableMouseCapture).ok();
    terminal.show_cursor().ok();
    Ok(())
}

fn install_panic_hook() {
    let original = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let _ = disable_raw_mode();
        let _ = execute!(io::stdout(), LeaveAlternateScreen, DisableMouseCapture);
        original(info);
    }));
}

async fn run_app(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    client: SupabaseClient,
) -> Result<()> {
    let mut app = App::new();
    app.set_status("Loading films…");
    terminal.draw(|f| ui::draw(f, &app))?;

    perform_refresh(&mut app, &client).await?;

    loop {
        terminal.draw(|f| ui::draw(f, &app))?;

        if event::poll(Duration::from_millis(150))? {
            let evt = event::read()?;
            // Quit shortcut even if some unusual key combo arrives
            if let Event::Key(k) = &evt {
                if k.kind == crossterm::event::KeyEventKind::Press
                    && k.modifiers.contains(crossterm::event::KeyModifiers::CONTROL)
                    && matches!(k.code, crossterm::event::KeyCode::Char('c'))
                {
                    break;
                }
            }
            match handle_event(&mut app, evt) {
                Action::Quit => break,
                Action::Refresh => {
                    perform_refresh(&mut app, &client).await?;
                }
                Action::Save => {
                    perform_save(&mut app, &client).await?;
                }
                Action::SetActive(active) => {
                    perform_set_active(&mut app, &client, active).await?;
                }
                Action::None => {}
            }
        }

        if app.should_quit {
            break;
        }
    }
    Ok(())
}
