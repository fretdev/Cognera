"""
Cognera — Zero-API-Key Web & Weather Search Engine
===================================================
Provides fast, reliable real-time web search and live weather data
without depending on paid LLM search grounding or external API keys.
"""

import re
import logging
import httpx

logger = logging.getLogger(__name__)


def perform_free_web_search(query: str, num_results: int = 5) -> list[dict]:
    """
    Fetch live web search results and weather data using free APIs and DuckDuckGo.
    """
    q_lower = query.lower()
    results = []

    # 1. Weather Special Handling
    if any(w in q_lower for w in ["weather", "temperature", "forecast", "rain", "sunny", "climate"]):
        city = "Osogbo"
        words = query.split()
        for word in words:
            clean_word = re.sub(r'[^a-zA-Z]', '', word)
            if clean_word.lower() not in [
                "what", "is", "the", "weather", "in", "like", "today", "presently",
                "current", "forecast", "temperature", "how", "hot", "cold", "outside"
            ] and len(clean_word) > 2:
                city = clean_word
                break

        try:
            geo_resp = httpx.get(
                f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en&format=json",
                timeout=3.5
            )
            if geo_resp.status_code == 200:
                geo_data = geo_resp.json()
                if geo_data.get("results"):
                    loc = geo_data["results"][0]
                    lat, lon = loc["latitude"], loc["longitude"]
                    city_name = loc.get("name", city)
                    country = loc.get("country", "")

                    w_resp = httpx.get(
                        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true",
                        timeout=3.5
                    )
                    if w_resp.status_code == 200:
                        cw = w_resp.json().get("current_weather", {})
                        temp = cw.get("temperature", "N/A")
                        wind = cw.get("windspeed", "N/A")
                        results.append({
                            "title": f"Live Weather for {city_name}, {country}",
                            "uri": "https://open-meteo.com",
                            "snippet": f"The current temperature in {city_name} is {temp}°C with wind speed of {wind} km/h."
                        })
        except Exception as e:
            logger.warning(f"Open-Meteo weather fetch exception: {e}")

    # 2. General DuckDuckGo Web Search
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
        url = f"https://html.duckduckgo.com/html/?q={httpx.encode_uri(query)}"
        resp = httpx.get(url, headers=headers, timeout=4.5)
        if resp.status_code == 200:
            titles = re.findall(r'<a class="result__a"[^>]*>(.*?)</a>', resp.text)
            links = re.findall(r'<a class="result__url" href="([^"]+)">', resp.text)
            snippets = re.findall(r'<a class="result__snippet"[^>]*>(.*?)</a>', resp.text)
            for t, l, s in zip(titles, links, snippets):
                clean_title = re.sub(r'<[^>]+>', '', t).strip()
                clean_snippet = re.sub(r'<[^>]+>', '', s).strip()
                clean_url = l.strip()
                if not clean_url.startswith("http"):
                    clean_url = "https://" + clean_url
                if clean_title and clean_snippet:
                    results.append({
                        "title": clean_title,
                        "uri": clean_url,
                        "snippet": clean_snippet,
                    })
    except Exception as e:
        logger.warning(f"DuckDuckGo search exception: {e}")

    return results[:num_results]
