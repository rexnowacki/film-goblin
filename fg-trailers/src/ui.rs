use crate::app::{ActiveField, App, Mode};
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap},
    Frame,
};

const ACCENT: Color = Color::Magenta;
const DIM: Color = Color::DarkGray;

pub fn draw(f: &mut Frame, app: &App) {
    let area = f.area();
    let outer = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(3),
        ])
        .split(area);

    draw_header(f, outer[0], app);

    let body = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(40), Constraint::Min(20)])
        .split(outer[1]);

    draw_film_list(f, body[0], app);
    draw_detail_pane(f, body[1], app);
    draw_footer(f, outer[2], app);
}

fn draw_header(f: &mut Frame, area: Rect, app: &App) {
    let search_active = app.mode == Mode::Searching;
    let search_label = if search_active { "Search ▶ " } else { "Search:  " };
    let search_value = app.search_query();
    let search_display = if search_value.is_empty() && !search_active {
        Span::styled("(press / to filter)", Style::default().fg(DIM))
    } else {
        Span::raw(search_value)
    };
    let cursor = if search_active {
        Span::styled("_", Style::default().fg(ACCENT).add_modifier(Modifier::SLOW_BLINK))
    } else {
        Span::raw("")
    };

    let missing_state = if app.show_missing_only { "[on] " } else { "[off]" };
    let missing_style = if app.show_missing_only {
        Style::default().fg(ACCENT).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(DIM)
    };

    let line = Line::from(vec![
        Span::raw(search_label),
        search_display,
        cursor,
        Span::raw("    Missing only "),
        Span::styled(missing_state, missing_style),
    ]);

    let title = Line::from(vec![
        Span::styled(
            " FilmGoblin Trailer Forge ",
            Style::default().fg(ACCENT).add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!(
                " {}/{} films ",
                app.filtered_indices.len(),
                app.films.len()
            ),
            Style::default().fg(DIM),
        ),
    ]);

    let para = Paragraph::new(line).block(Block::default().borders(Borders::ALL).title(title));
    f.render_widget(para, area);
}

fn draw_film_list(f: &mut Frame, area: Rect, app: &App) {
    let items: Vec<ListItem> = app
        .filtered_indices
        .iter()
        .map(|&i| {
            let film = &app.films[i];
            let glyph = film.status_glyph();
            let retired = film.is_retired();
            let glyph_style = match glyph {
                "✓" => Style::default().fg(Color::Green),
                "?" => Style::default().fg(Color::Yellow),
                "⊘" => Style::default().fg(Color::Red).add_modifier(Modifier::DIM),
                _ => Style::default().fg(DIM),
            };
            let year = film
                .year
                .map(|y| if y > 0 { format!("{y}") } else { "----".into() })
                .unwrap_or_else(|| "----".into());
            let title_style = if retired {
                Style::default().fg(DIM).add_modifier(Modifier::CROSSED_OUT)
            } else {
                Style::default()
            };
            let line = Line::from(vec![
                Span::styled(format!(" {glyph} "), glyph_style),
                Span::styled(truncate(&film.title, 38), title_style),
                Span::raw("  "),
                Span::styled(year, Style::default().fg(DIM)),
            ]);
            ListItem::new(line)
        })
        .collect();

    let mut list_state = ListState::default();
    if !app.filtered_indices.is_empty() {
        list_state.select(Some(app.selected_filtered_index));
    }

    let focus = app.active_field == ActiveField::FilmList && app.mode == Mode::Browsing;
    let title = Line::from(vec![
        Span::raw(" Films "),
        if focus { Span::styled("●", Style::default().fg(ACCENT)) } else { Span::raw("") },
    ]);

    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title(title))
        .highlight_style(
            Style::default()
                .bg(if focus { ACCENT } else { Color::DarkGray })
                .fg(Color::Black)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol(">");

    f.render_stateful_widget(list, area, &mut list_state);
}

fn draw_detail_pane(f: &mut Frame, area: Rect, app: &App) {
    let block = Block::default().borders(Borders::ALL).title(" Selected Film ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let film = match app.selected_film() {
        Some(f) => f,
        None => {
            let p = Paragraph::new("(no film selected)").style(Style::default().fg(DIM));
            f.render_widget(p, inner);
            return;
        }
    };

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // title
            Constraint::Length(1), // year
            Constraint::Length(1), // id
            Constraint::Length(1), // spacer
            Constraint::Length(2), // url label + value
            Constraint::Length(1), // spacer
            Constraint::Length(2), // label label + value
            Constraint::Length(1), // spacer
            Constraint::Length(1), // verified
            Constraint::Length(1), // youtube id
            Constraint::Length(1), // spacer
            Constraint::Min(1),    // status
        ])
        .split(inner);

    let mut title_spans = vec![
        Span::styled("Title: ", Style::default().fg(DIM)),
        Span::styled(film.title.clone(), Style::default().add_modifier(Modifier::BOLD)),
    ];
    if film.is_retired() {
        title_spans.push(Span::raw("  "));
        title_spans.push(Span::styled(
            "RETIRED",
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        ));
    }
    f.render_widget(Paragraph::new(Line::from(title_spans)), rows[0]);

    let year = film.year.map(|y| y.to_string()).unwrap_or_else(|| "—".into());
    f.render_widget(
        Paragraph::new(Line::from(vec![Span::styled("Year: ", Style::default().fg(DIM)), Span::raw(year)])),
        rows[1],
    );

    let id_short = if film.id.len() > 8 { format!("{}…", &film.id[..8]) } else { film.id.clone() };
    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled("Film ID: ", Style::default().fg(DIM)),
            Span::raw(id_short),
        ])),
        rows[2],
    );

    // URL
    let url_focus = app.active_field == ActiveField::TrailerUrl;
    let url_editing = app.mode == Mode::EditingTrailerUrl;
    f.render_widget(
        Paragraph::new(field_label("Trailer URL", url_focus, url_editing)),
        rows[4].clone_top_line(),
    );
    let url_value = app.trailer_url_input.value();
    let url_value_display = if url_value.is_empty() {
        Span::styled("(empty)", Style::default().fg(DIM))
    } else {
        Span::raw(url_value.to_string())
    };
    f.render_widget(
        Paragraph::new(input_box(url_value_display, url_focus, url_editing)).wrap(Wrap { trim: false }),
        rows[4].clone_bottom_line(),
    );

    // Label
    let label_focus = app.active_field == ActiveField::TrailerLabel;
    let label_editing = app.mode == Mode::EditingLabel;
    f.render_widget(
        Paragraph::new(field_label("Label", label_focus, label_editing)),
        rows[6].clone_top_line(),
    );
    let label_value = app.trailer_label_input.value();
    let label_display = if label_value.is_empty() {
        Span::styled("(empty)", Style::default().fg(DIM))
    } else {
        Span::raw(label_value.to_string())
    };
    f.render_widget(
        Paragraph::new(input_box(label_display, label_focus, label_editing)),
        rows[6].clone_bottom_line(),
    );

    // Verified
    let verified_focus = app.active_field == ActiveField::Verified;
    let mark = if app.trailer_verified { "[x]" } else { "[ ]" };
    let verified_line = Line::from(vec![
        Span::styled("Verified: ", Style::default().fg(DIM)),
        Span::styled(
            mark,
            if verified_focus {
                Style::default().fg(ACCENT).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            },
        ),
        Span::raw("   (Space to toggle)"),
    ]);
    f.render_widget(Paragraph::new(verified_line), rows[8]);

    let yt = app.current_youtube_id();
    let yt_line = Line::from(vec![
        Span::styled("YouTube ID: ", Style::default().fg(DIM)),
        match yt.clone() {
            Some(id) => Span::styled(id, Style::default().fg(Color::Green)),
            None => Span::styled(
                if app.url_input_is_empty() { "—" } else { "INVALID URL" },
                Style::default().fg(if app.url_input_is_empty() { DIM } else { Color::Red }),
            ),
        },
    ]);
    f.render_widget(Paragraph::new(yt_line), rows[9]);

    let status_line = if let Some(err) = &app.error_message {
        Line::from(vec![Span::styled(format!("⚠ {err}"), Style::default().fg(Color::Red))])
    } else {
        let mut spans: Vec<Span> = Vec::new();
        if app.saving {
            spans.push(Span::styled("Saving…", Style::default().fg(Color::Yellow)));
        } else if app.dirty {
            spans.push(Span::styled("Unsaved changes", Style::default().fg(Color::Yellow)));
        } else if !app.status_message.is_empty() {
            spans.push(Span::styled(app.status_message.clone(), Style::default().fg(Color::Green)));
        } else {
            spans.push(Span::styled("Status: clean", Style::default().fg(DIM)));
        }
        Line::from(spans)
    };
    f.render_widget(Paragraph::new(status_line).wrap(Wrap { trim: true }), rows[11]);
}

fn field_label(name: &str, focus: bool, editing: bool) -> Line<'static> {
    let mut spans = vec![Span::styled(format!("{name}: "), Style::default().fg(DIM))];
    if editing {
        spans.push(Span::styled("(editing — Esc to leave)", Style::default().fg(ACCENT)));
    } else if focus {
        spans.push(Span::styled("(Enter to edit)", Style::default().fg(DIM)));
    }
    Line::from(spans)
}

fn input_box<'a>(value: Span<'a>, focus: bool, editing: bool) -> Line<'a> {
    let bracket_style = if editing {
        Style::default().fg(ACCENT).add_modifier(Modifier::BOLD)
    } else if focus {
        Style::default().fg(ACCENT)
    } else {
        Style::default().fg(DIM)
    };
    let mut spans = vec![Span::styled("[ ", bracket_style), value];
    if editing {
        spans.push(Span::styled("_", Style::default().fg(ACCENT).add_modifier(Modifier::SLOW_BLINK)));
    }
    spans.push(Span::styled(" ]", bracket_style));
    Line::from(spans)
}

fn draw_footer(f: &mut Frame, area: Rect, app: &App) {
    let (hint, style) = match app.mode {
        Mode::Searching => ("Esc cancel  Enter apply  type to filter", Style::default().fg(DIM)),
        Mode::EditingTrailerUrl | Mode::EditingLabel => ("Esc done  type to edit", Style::default().fg(DIM)),
        Mode::ConfirmingRetire => ("Confirm RETIRE: y to retire  n/Esc to cancel", Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
        Mode::ConfirmingUnretire => ("Confirm UN-RETIRE: y to restore  n/Esc to cancel", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
        Mode::Browsing => ("↑/↓/←/→ Nav  / Search  Tab Field  Space Verify  S Save  C Clear  O Open  Y YouTube  M Missing  N Next-missing  X Retire  R Refresh  Q Quit", Style::default().fg(DIM)),
    };
    let para = Paragraph::new(Line::from(Span::styled(hint, style)))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(para, area);
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let trunc: String = s.chars().take(max.saturating_sub(1)).collect();
        format!("{trunc}…")
    }
}

trait RectSplit {
    fn clone_top_line(self) -> Rect;
    fn clone_bottom_line(self) -> Rect;
}

impl RectSplit for Rect {
    fn clone_top_line(self) -> Rect {
        Rect { height: 1, ..self }
    }
    fn clone_bottom_line(self) -> Rect {
        Rect {
            y: self.y.saturating_add(1),
            height: self.height.saturating_sub(1),
            ..self
        }
    }
}
