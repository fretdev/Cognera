"""
Cognera — Zero-API-Key Web & Weather Search Engine
===================================================
Provides fast, reliable real-time web search and live weather data
without depending on paid LLM search grounding or external API keys.

CRITICAL: This module must NEVER raise an exception. All errors are
caught internally and an empty list is returned as fallback.
"""

import re
import logging
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)


def _fetch_weather(query: str) -> list[dict]:
    """Fetch live weather from Open-Meteo (free, no API key)."""
    import httpx

    q_lower = query.lower()
    if not any(w in q_lower for w in ["weather", "temperature", "forecast", "rain", "sunny", "climate", "humidity"]):
        return []

    stop_words = {
        "what", "is", "the", "weather", "in", "like", "today", "presently",
        "current", "forecast", "temperature", "how", "hot", "cold", "outside",
        "right", "now", "at", "moment", "this", "tell", "me", "about", "of",
        "a", "an", "and", "for", "does", "it", "look", "will", "be",
    }
    words = query.split()
    city = "Lagos"
    for word in words:
        clean_word = re.sub(r'[^a-zA-Z]', '', word)
        if clean_word.lower() not in stop_words and len(clean_word) > 2:
            city = clean_word
            break

    try:
        geo_resp = httpx.get(
            f"https://geocoding-api.open-meteo.com/v1/search?name={quote_plus(city)}&count=1&language=en&format=json",
            timeout=4.0
        )
        if geo_resp.status_code != 200:
            return []
        geo_data = geo_resp.json()
        if not geo_data.get("results"):
            return []

        loc = geo_data["results"][0]
        lat, lon = loc["latitude"], loc["longitude"]
        city_name = loc.get("name", city)
        country = loc.get("country", "")

        w_resp = httpx.get(
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true",
            timeout=4.0
        )
        if w_resp.status_code == 200:
            cw = w_resp.json().get("current_weather", {})
            temp = cw.get("temperature", "N/A")
            wind = cw.get("windspeed", "N/A")
            code = cw.get("weathercode", 0)
            wmo = {0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
                   45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
                   55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
                   71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 80: "Slight rain showers",
                   81: "Moderate rain showers", 82: "Violent rain showers", 95: "Thunderstorm"}
            condition = wmo.get(code, "Variable conditions")
            return [{
                "title": f"Live Weather for {city_name}, {country}",
                "uri": "https://open-meteo.com",
                "snippet": (
                    f"Current weather in {city_name}, {country}: {temp}C, "
                    f"{condition}. Wind speed: {wind} km/h."
                )
            }]
    except Exception as e:
        logger.warning(f"Open-Meteo weather fetch exception: {e}")
    return []


def _fetch_duckduckgo_library(query: str, num_results: int = 5) -> list[dict]:
    """Search DuckDuckGo using the lite endpoint (no external library needed)."""
    import httpx
    results = []

    # Use DuckDuckGo lite — simpler HTML, more reliable parsing
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }
        resp = httpx.post(
            "https://lite.duckduckgo.com/lite/",
            data={"q": query},
            headers=headers,
            timeout=6.0,
            follow_redirects=True,
        )
        if resp.status_code == 200:
            # DuckDuckGo Lite uses table rows for results
            # Each result has: link row, then snippet row
            import re
            # Find all result links and snippets
            link_pattern = r'<a[^>]*rel="nofollow"[^>]*href="([^"]*)"[^>]*>\s*(.*?)\s*</a>'
            snippet_pattern = r'<td[^>]*class="result-snippet"[^>]*>(.*?)</td>'

            links = re.findall(link_pattern, resp.text, re.DOTALL)
            snippets = re.findall(snippet_pattern, resp.text, re.DOTALL)

            for i in range(min(len(links), len(snippets), num_results)):
                url = links[i][0].strip()
                title = re.sub(r'<[^>]+>', '', links[i][1]).strip()
                snippet = re.sub(r'<[^>]+>', '', snippets[i]).strip()
                if title and snippet and url.startswith("http"):
                    results.append({
                        "title": title,
                        "uri": url,
                        "snippet": snippet[:400],
                    })
    except Exception as e:
        logger.warning(f"DuckDuckGo Lite search exception: {e}")

    return results


def _fetch_duckduckgo_api(query: str, num_results: int = 5) -> list[dict]:
    """Fallback: DuckDuckGo Instant Answer API (JSON)."""
    import httpx
    results = []
    try:
        api_resp = httpx.get(
            f"https://api.duckduckgo.com/?q={quote_plus(query)}&format=json&no_redirect=1&no_html=1",
            timeout=4.0,
            follow_redirects=True,
        )
        if api_resp.status_code == 200:
            data = api_resp.json()
            if data.get("AbstractText"):
                results.append({
                    "title": data.get("Heading", "DuckDuckGo Answer"),
                    "uri": data.get("AbstractURL", "https://duckduckgo.com"),
                    "snippet": data["AbstractText"][:500],
                })
            for topic in data.get("RelatedTopics", [])[:4]:
                if isinstance(topic, dict) and topic.get("Text"):
                    results.append({
                        "title": topic.get("Text", "")[:80],
                        "uri": topic.get("FirstURL", ""),
                        "snippet": topic.get("Text", "")[:300],
                    })
    except Exception as e:
        logger.warning(f"DuckDuckGo API exception: {e}")
    return results


def _fetch_duckduckgo_html(query: str, num_results: int = 5) -> list[dict]:
    """Last resort fallback: DuckDuckGo HTML scraping."""
    import httpx
    results = []
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        resp = httpx.get(url, headers=headers, timeout=5.0, follow_redirects=True)
        if resp.status_code == 200:
            titles = re.findall(r'<a[^>]*class="result__a"[^>]*>(.*?)</a>', resp.text, re.DOTALL)
            snippets = re.findall(r'<a[^>]*class="result__snippet"[^>]*>(.*?)</a>', resp.text, re.DOTALL)
            links = re.findall(r'<a[^>]*class="result__url"[^>]*href="([^"]*)"', resp.text)

            for i in range(min(len(titles), len(snippets), num_results)):
                clean_title = re.sub(r'<[^>]+>', '', titles[i]).strip()
                clean_snippet = re.sub(r'<[^>]+>', '', snippets[i]).strip()
                clean_url = links[i].strip() if i < len(links) else ""
                if not clean_url.startswith("http"):
                    clean_url = "https://" + clean_url.lstrip("/")
                if clean_title and clean_snippet:
                    results.append({
                        "title": clean_title,
                        "uri": clean_url,
                        "snippet": clean_snippet,
                    })
    except Exception as e:
        logger.warning(f"DuckDuckGo HTML search exception: {e}")
    return results


def perform_free_web_search(query: str, num_results: int = 5) -> list[dict]:
    """
    Main entry point. Combines weather + DuckDuckGo search with 3 fallback layers.
    GUARANTEED to never raise an exception.

    Search cascade:
    1. duckduckgo-search library (most reliable)
    2. DuckDuckGo Instant Answer API (JSON)
    3. DuckDuckGo HTML scraping (last resort)
    """
    try:
        results = _fetch_weather(query)

        # Try search methods in order of reliability
        search_results = _fetch_duckduckgo_library(query, num_results)

        if not search_results:
            logger.info("duckduckgo-search library returned 0, trying API fallback")
            search_results = _fetch_duckduckgo_api(query, num_results)

        if not search_results:
            logger.info("DuckDuckGo API returned 0, trying HTML fallback")
            search_results = _fetch_duckduckgo_html(query, num_results)

        results.extend(search_results)
        return results[:num_results]
    except Exception as e:
        logger.warning(f"perform_free_web_search total failure: {e}")
        return []
