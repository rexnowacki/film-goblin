use anyhow::{Context, Result, anyhow};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};

const FILM_COLUMNS: &str = "id,title,year,tracking,available,trailer_url,trailer_source,trailer_youtube_id,trailer_label,trailer_verified,trailer_updated_at";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Film {
    pub id: String,
    pub title: String,
    pub year: Option<i32>,
    pub tracking: Option<bool>,
    pub available: Option<bool>,
    pub trailer_url: Option<String>,
    pub trailer_source: Option<String>,
    pub trailer_youtube_id: Option<String>,
    pub trailer_label: Option<String>,
    pub trailer_verified: Option<bool>,
    pub trailer_updated_at: Option<String>,
}

impl Film {
    pub fn has_trailer(&self) -> bool {
        self.trailer_url.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false)
    }

    /// Mirrors `adminRetireFilm` — both flags must be explicitly false.
    pub fn is_retired(&self) -> bool {
        self.tracking == Some(false) && self.available == Some(false)
    }

    pub fn status_glyph(&self) -> &'static str {
        if self.is_retired() {
            return "⊘";
        }
        match (self.has_trailer(), self.trailer_verified.unwrap_or(false)) {
            (true, true) => "✓",
            (true, false) => "?",
            (false, _) => "—",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ActiveUpdate {
    pub tracking: bool,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrailerUpdate {
    pub trailer_url: Option<String>,
    pub trailer_source: Option<String>,
    pub trailer_youtube_id: Option<String>,
    pub trailer_label: Option<String>,
    pub trailer_verified: bool,
    pub trailer_updated_at: String,
}

impl TrailerUpdate {
    pub fn from_inputs(url: &str, label: &str, verified: bool, youtube_id: Option<&str>) -> Self {
        let url_trimmed = url.trim();
        let label_trimmed = label.trim();
        let now = Utc::now().to_rfc3339();
        if url_trimmed.is_empty() {
            Self {
                trailer_url: None,
                trailer_source: None,
                trailer_youtube_id: None,
                trailer_label: if label_trimmed.is_empty() { Some("Official Trailer".into()) } else { Some(label_trimmed.into()) },
                trailer_verified: false,
                trailer_updated_at: now,
            }
        } else {
            Self {
                trailer_url: Some(url_trimmed.into()),
                trailer_source: Some("youtube".into()),
                trailer_youtube_id: youtube_id.map(str::to_string),
                trailer_label: if label_trimmed.is_empty() { Some("Official Trailer".into()) } else { Some(label_trimmed.into()) },
                trailer_verified: verified,
                trailer_updated_at: now,
            }
        }
    }
}

#[derive(Clone)]
pub struct SupabaseClient {
    base_url: String,
    http: reqwest::Client,
}

impl SupabaseClient {
    pub fn new(base_url: String, service_role_key: String) -> Result<Self> {
        if base_url.trim().is_empty() {
            return Err(anyhow!("Missing SUPABASE_URL"));
        }
        if service_role_key.trim().is_empty() {
            return Err(anyhow!("Missing SUPABASE_SERVICE_ROLE_KEY"));
        }
        let mut headers = HeaderMap::new();
        let mut key_value = HeaderValue::from_str(&service_role_key)
            .context("SUPABASE_SERVICE_ROLE_KEY contains invalid header characters")?;
        key_value.set_sensitive(true);
        let bearer = format!("Bearer {service_role_key}");
        let mut bearer_value = HeaderValue::from_str(&bearer)
            .context("SUPABASE_SERVICE_ROLE_KEY contains invalid header characters")?;
        bearer_value.set_sensitive(true);
        headers.insert("apikey", key_value);
        headers.insert(reqwest::header::AUTHORIZATION, bearer_value);
        headers.insert(reqwest::header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("Prefer", HeaderValue::from_static("return=representation"));

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .user_agent("fg-trailers/0.1")
            .build()
            .context("failed to build HTTP client")?;

        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            http,
        })
    }

    pub async fn fetch_films(&self) -> Result<Vec<Film>> {
        let url = format!(
            "{}/rest/v1/films?select={FILM_COLUMNS}&order=title.asc",
            self.base_url
        );
        let resp = self.http.get(&url).send().await.context("GET films failed")?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("fetch_films {status}: {}", truncate(&text, 400)));
        }
        let films: Vec<Film> = serde_json::from_str(&text).context("decode films json")?;
        Ok(films)
    }

    pub async fn update_trailer(&self, film_id: &str, patch: &TrailerUpdate) -> Result<Film> {
        let url = format!(
            "{}/rest/v1/films?id=eq.{}&select={FILM_COLUMNS}",
            self.base_url,
            urlencoding(film_id)
        );
        let resp = self
            .http
            .patch(&url)
            .json(patch)
            .send()
            .await
            .context("PATCH film failed")?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("update_trailer {status}: {}", truncate(&text, 400)));
        }
        let mut rows: Vec<Film> = serde_json::from_str(&text).context("decode update response")?;
        rows.pop().ok_or_else(|| anyhow!("update returned no rows for id={film_id}"))
    }

    pub async fn set_film_active(&self, film_id: &str, active: bool) -> Result<Film> {
        let url = format!(
            "{}/rest/v1/films?id=eq.{}&select={FILM_COLUMNS}",
            self.base_url,
            urlencoding(film_id)
        );
        let patch = ActiveUpdate { tracking: active, available: active };
        let resp = self
            .http
            .patch(&url)
            .json(&patch)
            .send()
            .await
            .context("PATCH film tracking/available failed")?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("set_film_active {status}: {}", truncate(&text, 400)));
        }
        let mut rows: Vec<Film> = serde_json::from_str(&text).context("decode update response")?;
        rows.pop().ok_or_else(|| anyhow!("update returned no rows for id={film_id}"))
    }
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max { s.to_string() } else { format!("{}…", &s[..max]) }
}
