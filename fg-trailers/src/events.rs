use crate::app::{ActiveField, App, Mode};
use crate::supabase::SupabaseClient;
use crate::youtube::{is_valid_youtube_url, youtube_search_url};
use anyhow::Result;
use crossterm::event::{Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use tui_input::backend::crossterm::EventHandler;

pub enum Action {
    None,
    Quit,
    Refresh,
    Save,
    SetActive(bool),
}

pub fn handle_event(app: &mut App, event: Event) -> Action {
    let key = match event {
        Event::Key(k) if k.kind == KeyEventKind::Press => k,
        Event::Key(_) => return Action::None,
        other => {
            // forward resize/paste events to active text input
            if matches!(app.mode, Mode::Searching | Mode::EditingTrailerUrl | Mode::EditingLabel) {
                forward_to_active_input(app, other.clone());
            }
            return Action::None;
        }
    };

    match app.mode {
        Mode::Searching => handle_search_key(app, key),
        Mode::EditingTrailerUrl => handle_text_edit_key(app, key, true),
        Mode::EditingLabel => handle_text_edit_key(app, key, false),
        Mode::Browsing => handle_browse_key(app, key),
        Mode::ConfirmingRetire => handle_confirm_key(app, key, true),
        Mode::ConfirmingUnretire => handle_confirm_key(app, key, false),
    }
}

fn handle_confirm_key(app: &mut App, key: KeyEvent, retire: bool) -> Action {
    match key.code {
        KeyCode::Char('y') | KeyCode::Char('Y') => {
            app.mode = Mode::Browsing;
            Action::SetActive(!retire)
        }
        KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
            app.mode = Mode::Browsing;
            app.set_status("Cancelled");
            Action::None
        }
        _ => Action::None,
    }
}

fn forward_to_active_input(app: &mut App, event: Event) {
    let target = match app.mode {
        Mode::Searching => Some(&mut app.search_input),
        Mode::EditingTrailerUrl => Some(&mut app.trailer_url_input),
        Mode::EditingLabel => Some(&mut app.trailer_label_input),
        Mode::Browsing | Mode::ConfirmingRetire | Mode::ConfirmingUnretire => None,
    };
    if let Some(input) = target {
        input.handle_event(&event);
    }
    if matches!(app.mode, Mode::Searching) {
        app.recompute_filter();
    } else if matches!(app.mode, Mode::EditingTrailerUrl | Mode::EditingLabel) {
        app.dirty = true;
        app.error_message = None;
    }
}

fn handle_search_key(app: &mut App, key: KeyEvent) -> Action {
    match key.code {
        KeyCode::Esc => {
            app.mode = Mode::Browsing;
            app.set_status("");
        }
        KeyCode::Enter => {
            app.mode = Mode::Browsing;
            app.set_status(format!("Filter: {} matches", app.filtered_indices.len()));
        }
        _ => {
            app.search_input.handle_event(&Event::Key(key));
            app.recompute_filter();
            app.load_selected_into_inputs();
        }
    }
    Action::None
}

fn handle_text_edit_key(app: &mut App, key: KeyEvent, is_url: bool) -> Action {
    match key.code {
        KeyCode::Esc | KeyCode::Enter => {
            app.mode = Mode::Browsing;
            if is_url {
                if !app.url_input_is_empty() && !is_valid_youtube_url(app.trailer_url_input.value()) {
                    app.set_error("Trailer URL is not a recognized YouTube URL");
                } else {
                    app.error_message = None;
                }
            }
        }
        _ => {
            let target = if is_url { &mut app.trailer_url_input } else { &mut app.trailer_label_input };
            target.handle_event(&Event::Key(key));
            app.dirty = true;
            app.error_message = None;
        }
    }
    Action::None
}

fn handle_browse_key(app: &mut App, key: KeyEvent) -> Action {
    let plain = key.modifiers == KeyModifiers::NONE || key.modifiers == KeyModifiers::SHIFT;
    match key.code {
        KeyCode::Char('q') | KeyCode::Char('Q') | KeyCode::Esc => return Action::Quit,
        KeyCode::Char('/') => {
            app.mode = Mode::Searching;
            app.set_status("Type to filter; Esc cancel; Enter apply");
        }
        KeyCode::Char('s') | KeyCode::Char('S') if plain => return Action::Save,
        KeyCode::Char('r') | KeyCode::Char('R') if plain => return Action::Refresh,
        KeyCode::Char('m') | KeyCode::Char('M') if plain => {
            app.toggle_missing_only();
            app.set_status(if app.show_missing_only { "Showing missing-trailer films only" } else { "Showing all films" });
        }
        KeyCode::Char('n') | KeyCode::Char('N') if plain => app.jump_to_next_missing(),
        KeyCode::Char('c') | KeyCode::Char('C') if plain => app.clear_local_trailer_fields(),
        KeyCode::Char('o') | KeyCode::Char('O') if plain => open_trailer(app),
        KeyCode::Char('y') | KeyCode::Char('Y') if plain => open_youtube_search(app),
        KeyCode::Char('x') | KeyCode::Char('X') if plain => enter_retire_confirm(app),
        KeyCode::Char(' ') if app.active_field == ActiveField::Verified || app.active_field == ActiveField::FilmList => {
            app.toggle_verified();
            app.set_status(if app.trailer_verified { "Marked verified (unsaved)" } else { "Unmarked verified (unsaved)" });
        }
        KeyCode::Tab => {
            app.active_field = app.active_field.next();
        }
        KeyCode::BackTab => {
            app.active_field = app.active_field.prev();
        }
        KeyCode::Enter => match app.active_field {
            ActiveField::TrailerUrl => app.mode = Mode::EditingTrailerUrl,
            ActiveField::TrailerLabel => app.mode = Mode::EditingLabel,
            ActiveField::Verified => app.toggle_verified(),
            ActiveField::FilmList => {}
        },
        KeyCode::Up | KeyCode::Char('k') if app.active_field == ActiveField::FilmList => app.move_selection(-1),
        KeyCode::Down | KeyCode::Char('j') if app.active_field == ActiveField::FilmList => app.move_selection(1),
        KeyCode::Up => match app.active_field {
            ActiveField::TrailerLabel => app.active_field = ActiveField::TrailerUrl,
            ActiveField::Verified => app.active_field = ActiveField::TrailerLabel,
            _ => {}
        },
        KeyCode::Down => match app.active_field {
            ActiveField::TrailerUrl => app.active_field = ActiveField::TrailerLabel,
            ActiveField::TrailerLabel => app.active_field = ActiveField::Verified,
            _ => {}
        },
        KeyCode::Left => {
            if app.active_field != ActiveField::FilmList {
                app.active_field = ActiveField::FilmList;
            }
        }
        KeyCode::Right => {
            if app.active_field == ActiveField::FilmList {
                app.active_field = ActiveField::TrailerUrl;
            }
        }
        KeyCode::PageUp => app.move_selection(-10),
        KeyCode::PageDown => app.move_selection(10),
        KeyCode::Home => app.move_selection(i32::MIN / 2),
        KeyCode::End => app.move_selection(i32::MAX / 2),
        _ => {}
    }
    Action::None
}

fn enter_retire_confirm(app: &mut App) {
    let film = match app.selected_film() {
        Some(f) => f.clone(),
        None => {
            app.set_status("No film selected");
            return;
        }
    };
    let year = film.year.map(|y| format!("({y})")).unwrap_or_default();
    if film.is_retired() {
        app.mode = Mode::ConfirmingUnretire;
        app.set_status(format!("Un-retire \"{}\" {} ? (y/n)", film.title, year));
    } else {
        app.mode = Mode::ConfirmingRetire;
        app.set_status(format!("Retire \"{}\" {} ? (y/n)", film.title, year));
    }
}

fn open_trailer(app: &mut App) {
    let url = app.trailer_url_input.value().trim().to_string();
    if url.is_empty() {
        app.set_status("No trailer URL to open");
        return;
    }
    match webbrowser::open(&url) {
        Ok(_) => app.set_status("Opened trailer in browser"),
        Err(e) => app.set_error(format!("Failed to open browser: {e}")),
    }
}

fn open_youtube_search(app: &mut App) {
    let film = match app.selected_film() {
        Some(f) => f.clone(),
        None => {
            app.set_status("No film selected");
            return;
        }
    };
    let url = youtube_search_url(&film.title, film.year);
    match webbrowser::open(&url) {
        Ok(_) => app.set_status(format!("Opened YouTube search for {}", film.title)),
        Err(e) => app.set_error(format!("Failed to open browser: {e}")),
    }
}

pub async fn perform_save(app: &mut App, client: &SupabaseClient) -> Result<()> {
    let film = match app.selected_film() {
        Some(f) => f.clone(),
        None => {
            app.set_error("No film selected");
            return Ok(());
        }
    };

    if !app.url_input_is_empty() && !is_valid_youtube_url(app.trailer_url_input.value()) {
        app.set_error("Trailer URL is not a recognized YouTube URL");
        return Ok(());
    }

    let patch = app.build_trailer_update();
    app.saving = true;
    app.error_message = None;

    let result = client.update_trailer(&film.id, &patch).await;
    app.saving = false;

    match result {
        Ok(updated) => {
            let title = updated.title.clone();
            app.upsert_film(updated);
            app.dirty = false;
            app.load_selected_into_inputs();
            let suffix = if app.url_input_is_empty() { "cleared" } else { "saved" };
            app.set_status(format!("{title}: trailer {suffix}"));
        }
        Err(e) => app.set_error(format!("Save failed: {e}")),
    }
    Ok(())
}

pub async fn perform_set_active(app: &mut App, client: &SupabaseClient, active: bool) -> Result<()> {
    let film = match app.selected_film() {
        Some(f) => f.clone(),
        None => {
            app.set_error("No film selected");
            return Ok(());
        }
    };
    app.saving = true;
    app.error_message = None;
    let result = client.set_film_active(&film.id, active).await;
    app.saving = false;
    match result {
        Ok(updated) => {
            let title = updated.title.clone();
            app.upsert_film(updated);
            app.load_selected_into_inputs();
            app.set_status(format!(
                "{}: {}",
                title,
                if active { "un-retired" } else { "retired" }
            ));
        }
        Err(e) => app.set_error(format!(
            "{} failed: {e}",
            if active { "Un-retire" } else { "Retire" }
        )),
    }
    Ok(())
}

pub async fn perform_refresh(app: &mut App, client: &SupabaseClient) -> Result<()> {
    app.loading = true;
    app.error_message = None;
    let result = client.fetch_films().await;
    app.loading = false;
    match result {
        Ok(films) => {
            let n = films.len();
            app.set_films(films);
            app.set_status(format!("Loaded {n} films"));
        }
        Err(e) => app.set_error(format!("Refresh failed: {e}")),
    }
    Ok(())
}
