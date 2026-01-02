// TMDB API Client

const https = require('https');
const logger = require('../logger');

const TMDB_BASE_URL = 'api.themoviedb.org';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

class TMDBClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.enabled = !!apiKey;
    }

    /**
     * Sucht nach Film/Serie auf TMDB
     */
    async search(title, options = {}) {
        if (!this.enabled) {
            return null;
        }

        try {
            // Versuche zuerst als TV-Serie
            let result = await this._searchTV(title, options);
            
            // Falls nichts gefunden, versuche als Film
            if (!result) {
                result = await this._searchMovie(title, options);
            }

            return result;
        } catch (error) {
            logger.warn('TMDB search failed', { title, error: error.message });
            return null;
        }
    }

    /**
     * Sucht TV-Serie
     */
    async _searchTV(title, options = {}) {
        const params = new URLSearchParams({
            api_key: this.apiKey,
            query: title,
            language: 'de-DE',
            include_adult: 'false'
        });

        if (options.year) {
            params.append('first_air_date_year', options.year);
        }

        const results = await this._request(`/3/search/tv?${params}`);
        
        if (results && results.results && results.results.length > 0) {
            const match = results.results[0];
            return {
                id: match.id,
                type: 'tv',
                title: match.name,
                originalTitle: match.original_name,
                year: match.first_air_date ? match.first_air_date.substring(0, 4) : null,
                poster: match.poster_path ? `${TMDB_IMAGE_BASE}${match.poster_path}` : null,
                backdrop: match.backdrop_path ? `${TMDB_IMAGE_BASE}${match.backdrop_path}` : null,
                overview: match.overview,
                score: match.vote_average,
                popularity: match.popularity
            };
        }

        return null;
    }

    /**
     * Sucht Film
     */
    async _searchMovie(title, options = {}) {
        const params = new URLSearchParams({
            api_key: this.apiKey,
            query: title,
            language: 'de-DE',
            include_adult: 'false'
        });

        if (options.year) {
            params.append('year', options.year);
        }

        const results = await this._request(`/3/search/movie?${params}`);
        
        if (results && results.results && results.results.length > 0) {
            const match = results.results[0];
            return {
                id: match.id,
                type: 'movie',
                title: match.title,
                originalTitle: match.original_title,
                year: match.release_date ? match.release_date.substring(0, 4) : null,
                poster: match.poster_path ? `${TMDB_IMAGE_BASE}${match.poster_path}` : null,
                backdrop: match.backdrop_path ? `${TMDB_IMAGE_BASE}${match.backdrop_path}` : null,
                overview: match.overview,
                score: match.vote_average,
                popularity: match.popularity
            };
        }

        return null;
    }

    /**
     * HTTPS Request Helper
     */
    _request(path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: TMDB_BASE_URL,
                path: path,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Stremio-Mediathek-Addon/1.0'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }
}

module.exports = TMDBClient;
