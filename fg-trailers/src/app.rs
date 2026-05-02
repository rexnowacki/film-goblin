use crate::supabase::{Film, TrailerUpdate};
use crate::youtube::extract_youtube_id;
use tui_input::Input;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Browsing,
    Searching,
    EditingTrailerUrl,
    EditingLabel,
    ConfirmingRetire,
    ConfirmingUnretire,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveField {
    FilmList,
    TrailerUrl,
    TrailerLabel,
    Verified,
}

impl ActiveField {
    pub fn next(self) -> Self {
        match self {
            ActiveField::FilmList => ActiveField::TrailerUrl,
            ActiveField::TrailerUrl => ActiveField::TrailerLabel,
            ActiveField::TrailerLabel => ActiveField::Verified,
            ActiveField::Verified => ActiveField::FilmList,
        }
    }
    pub fn prev(self) -> Self {
        match self {
            ActiveField::FilmList => ActiveField::Verified,
            ActiveField::TrailerUrl => ActiveField::FilmList,
            ActiveField::TrailerLabel => ActiveField::TrailerUrl,
            ActiveField::Verified => ActiveField::TrailerLabel,
        }
    }
}

pub struct App {
    pub films: Vec<Film>,
    pub filtered_indices: Vec<usize>,
    pub selected_filtered_index: usize,

    pub search_input: Input,
    pub show_missing_only: bool,

    pub trailer_url_input: Input,
    pub trailer_label_input: Input,
    pub trailer_verified: bool,

    pub mode: Mode,
    pub active_field: ActiveField,

    pub dirty: bool,
    pub loading: bool,
    pub saving: bool,
    pub should_quit: bool,

    pub status_message: String,
    pub error_message: Option<String>,
}

impl App {
    pub fn new() -> Self {
        Self {
            films: Vec::new(),
            filtered_indices: Vec::new(),
            selected_filtered_index: 0,
            search_input: Input::default(),
            show_missing_only: false,
            trailer_url_input: Input::default(),
            trailer_label_input: Input::default(),
            trailer_verified: false,
            mode: Mode::Browsing,
            active_field: ActiveField::FilmList,
            dirty: false,
            loading: false,
            saving: false,
            should_quit: false,
            status_message: String::new(),
            error_message: None,
        }
    }

    pub fn set_films(&mut self, films: Vec<Film>) {
        self.films = films;
        self.recompute_filter();
        self.selected_filtered_index = 0;
        self.load_selected_into_inputs();
    }

    pub fn upsert_film(&mut self, film: Film) {
        if let Some(idx) = self.films.iter().position(|f| f.id == film.id) {
            self.films[idx] = film;
        }
        self.recompute_filter();
    }

    pub fn search_query(&self) -> &str {
        self.search_input.value()
    }

    pub fn recompute_filter(&mut self) {
        let q = self.search_query().to_lowercase();
        let q = q.trim();
        let missing_only = self.show_missing_only;

        let prev_id = self.selected_film().map(|f| f.id.clone());

        self.filtered_indices = self
            .films
            .iter()
            .enumerate()
            .filter(|(_, f)| {
                if missing_only && f.has_trailer() {
                    return false;
                }
                if q.is_empty() {
                    return true;
                }
                let title_match = f.title.to_lowercase().contains(q);
                let year_match = f
                    .year
                    .map(|y| y.to_string().contains(q))
                    .unwrap_or(false);
                title_match || year_match
            })
            .map(|(i, _)| i)
            .collect();

        if self.filtered_indices.is_empty() {
            self.selected_filtered_index = 0;
            return;
        }

        if let Some(prev) = prev_id {
            if let Some(pos) = self
                .filtered_indices
                .iter()
                .position(|&i| self.films[i].id == prev)
            {
                self.selected_filtered_index = pos;
                return;
            }
        }
        self.selected_filtered_index = self.selected_filtered_index.min(self.filtered_indices.len().saturating_sub(1));
    }

    pub fn selected_film(&self) -> Option<&Film> {
        let idx = *self.filtered_indices.get(self.selected_filtered_index)?;
        self.films.get(idx)
    }

    pub fn move_selection(&mut self, delta: i32) {
        if self.filtered_indices.is_empty() {
            return;
        }
        let len = self.filtered_indices.len() as i32;
        let mut next = self.selected_filtered_index as i32 + delta;
        if next < 0 { next = 0; }
        if next >= len { next = len - 1; }
        if next as usize != self.selected_filtered_index {
            self.selected_filtered_index = next as usize;
            self.load_selected_into_inputs();
        }
    }

    pub fn load_selected_into_inputs(&mut self) {
        let (url, label, verified) = match self.selected_film() {
            Some(f) => (
                f.trailer_url.clone().unwrap_or_default(),
                f.trailer_label.clone().unwrap_or_else(|| "Official Trailer".into()),
                f.trailer_verified.unwrap_or(false),
            ),
            None => (String::new(), "Official Trailer".into(), false),
        };
        self.trailer_url_input = Input::default().with_value(url);
        self.trailer_label_input = Input::default().with_value(label);
        self.trailer_verified = verified;
        self.dirty = false;
    }

    pub fn clear_local_trailer_fields(&mut self) {
        self.trailer_url_input = Input::default();
        self.trailer_label_input = Input::default().with_value("Official Trailer".into());
        self.trailer_verified = false;
        self.dirty = true;
        self.status_message = "Cleared. Press S to save.".into();
    }

    pub fn toggle_verified(&mut self) {
        self.trailer_verified = !self.trailer_verified;
        self.dirty = true;
    }

    pub fn toggle_missing_only(&mut self) {
        self.show_missing_only = !self.show_missing_only;
        self.recompute_filter();
        self.load_selected_into_inputs();
    }

    pub fn jump_to_next_missing(&mut self) {
        if self.filtered_indices.is_empty() {
            return;
        }
        let start = self.selected_filtered_index;
        let len = self.filtered_indices.len();
        for offset in 1..=len {
            let pos = (start + offset) % len;
            let film_idx = self.filtered_indices[pos];
            if !self.films[film_idx].has_trailer() {
                self.selected_filtered_index = pos;
                self.load_selected_into_inputs();
                self.status_message = format!(
                    "Jumped to next missing: {}",
                    self.films[film_idx].title
                );
                return;
            }
        }
        self.status_message = "No missing trailers in current view.".into();
    }

    pub fn current_youtube_id(&self) -> Option<String> {
        extract_youtube_id(self.trailer_url_input.value())
    }

    pub fn url_input_is_empty(&self) -> bool {
        self.trailer_url_input.value().trim().is_empty()
    }

    pub fn build_trailer_update(&self) -> TrailerUpdate {
        let yt = self.current_youtube_id();
        TrailerUpdate::from_inputs(
            self.trailer_url_input.value(),
            self.trailer_label_input.value(),
            self.trailer_verified,
            yt.as_deref(),
        )
    }

    pub fn set_status(&mut self, msg: impl Into<String>) {
        self.status_message = msg.into();
        self.error_message = None;
    }

    pub fn set_error(&mut self, msg: impl Into<String>) {
        self.error_message = Some(msg.into());
    }
}
