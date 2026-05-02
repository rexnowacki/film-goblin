use url::Url;

pub fn extract_youtube_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed = Url::parse(trimmed).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();

    let id = match host.as_str() {
        "youtu.be" => parsed.path().trim_start_matches('/').split('/').next().map(str::to_string),
        h if h.ends_with("youtube.com") || h == "youtube.com" => {
            if let Some((_, v)) = parsed.query_pairs().find(|(k, _)| k == "v") {
                Some(v.into_owned())
            } else {
                let segments: Vec<&str> = parsed.path().trim_start_matches('/').split('/').collect();
                match segments.as_slice() {
                    ["embed", id, ..] => Some((*id).to_string()),
                    ["shorts", id, ..] => Some((*id).to_string()),
                    ["v", id, ..] => Some((*id).to_string()),
                    _ => None,
                }
            }
        }
        _ => None,
    }?;

    let id = id.trim().to_string();
    if id.is_empty() { None } else { Some(id) }
}

pub fn is_valid_youtube_url(input: &str) -> bool {
    extract_youtube_id(input).is_some()
}

pub fn youtube_search_url(title: &str, year: Option<i32>) -> String {
    let mut query = String::new();
    query.push_str(title);
    if let Some(y) = year {
        if y > 0 {
            query.push(' ');
            query.push_str(&y.to_string());
        }
    }
    query.push_str(" official trailer");
    let encoded: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
    format!("https://www.youtube.com/results?search_query={encoded}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_standard_watch_url() {
        assert_eq!(extract_youtube_id("https://www.youtube.com/watch?v=ABC123"), Some("ABC123".into()));
    }

    #[test]
    fn extracts_no_subdomain_watch_url() {
        assert_eq!(extract_youtube_id("https://youtube.com/watch?v=ABC123"), Some("ABC123".into()));
    }

    #[test]
    fn extracts_mobile_watch_url() {
        assert_eq!(extract_youtube_id("https://m.youtube.com/watch?v=ABC123"), Some("ABC123".into()));
    }

    #[test]
    fn extracts_short_url() {
        assert_eq!(extract_youtube_id("https://youtu.be/ABC123"), Some("ABC123".into()));
    }

    #[test]
    fn extracts_embed_url() {
        assert_eq!(extract_youtube_id("https://www.youtube.com/embed/ABC123"), Some("ABC123".into()));
    }

    #[test]
    fn extracts_shorts_url() {
        assert_eq!(extract_youtube_id("https://www.youtube.com/shorts/ABC123"), Some("ABC123".into()));
    }

    #[test]
    fn rejects_vimeo() {
        assert_eq!(extract_youtube_id("https://vimeo.com/ABC123"), None);
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(extract_youtube_id("not a url"), None);
    }

    #[test]
    fn rejects_empty() {
        assert_eq!(extract_youtube_id(""), None);
    }

    #[test]
    fn ignores_extra_query_params() {
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/watch?v=ABC123&t=42s&list=PL"),
            Some("ABC123".into())
        );
    }

    #[test]
    fn search_url_includes_year_and_title() {
        let url = youtube_search_url("Suspiria", Some(1977));
        assert!(url.contains("Suspiria"));
        assert!(url.contains("1977"));
        assert!(url.contains("official"));
        assert!(url.contains("trailer"));
    }

    #[test]
    fn search_url_handles_missing_year() {
        let url = youtube_search_url("Mandy", None);
        assert!(url.contains("Mandy"));
        assert!(!url.contains("0"));
    }
}
