// Test-Script zum Prüfen der TMDB-Integration

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'app', 'app.db');

console.log('📊 TMDB Poster Statistik\n');
console.log('Database:', dbPath);
console.log('='.repeat(50));

try {
    const db = new Database(dbPath, { readonly: true });

    // Total Items
    const total = db.prepare('SELECT COUNT(*) as count FROM items').get();
    console.log(`\n📦 Gesamt Items: ${total.count}`);

    // Items mit Poster
    const withPoster = db.prepare('SELECT COUNT(*) as count FROM items WHERE poster IS NOT NULL AND poster != ""').get();
    console.log(`🖼️  Items mit Poster: ${withPoster.count}`);

    // Items ohne Poster
    const withoutPoster = db.prepare('SELECT COUNT(*) as count FROM items WHERE poster IS NULL OR poster = ""').get();
    console.log(`❌ Items ohne Poster: ${withoutPoster.count}`);

    // Prozentsatz
    const percentage = total.count > 0 ? ((withPoster.count / total.count) * 100).toFixed(1) : 0;
    console.log(`📈 Poster-Rate: ${percentage}%`);

    // TMDB Poster (enthält "image.tmdb.org")
    const tmdbPoster = db.prepare('SELECT COUNT(*) as count FROM items WHERE poster LIKE "%image.tmdb.org%"').get();
    console.log(`🎬 TMDB Poster: ${tmdbPoster.count}`);

    // Beispiele mit TMDB-Poster
    console.log('\n' + '='.repeat(50));
    console.log('🎯 Beispiele mit TMDB-Poster:\n');
    
    const examples = db.prepare(`
        SELECT title, channel, poster 
        FROM items 
        WHERE poster LIKE "%image.tmdb.org%" 
        ORDER BY date_ts DESC 
        LIMIT 10
    `).all();

    examples.forEach((item, i) => {
        console.log(`${i + 1}. ${item.title} (${item.channel})`);
        console.log(`   ${item.poster}\n`);
    });

    // Nach Kategorie
    console.log('='.repeat(50));
    console.log('📊 Poster nach Kategorie:\n');
    
    const byCategory = db.prepare(`
        SELECT 
            category,
            COUNT(*) as total,
            SUM(CASE WHEN poster LIKE "%image.tmdb.org%" THEN 1 ELSE 0 END) as with_tmdb,
            ROUND(100.0 * SUM(CASE WHEN poster LIKE "%image.tmdb.org%" THEN 1 ELSE 0 END) / COUNT(*), 1) as rate
        FROM items 
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY with_tmdb DESC
    `).all();

    byCategory.forEach(cat => {
        console.log(`${cat.category.padEnd(15)} | Total: ${String(cat.total).padStart(5)} | TMDB: ${String(cat.with_tmdb).padStart(4)} | Rate: ${String(cat.rate).padStart(5)}%`);
    });

    db.close();

} catch (error) {
    console.error('❌ Fehler:', error.message);
    console.error('\nHinweis: Stelle sicher, dass die Datenbank existiert.');
    console.error('Führe zuerst aus: npm run update');
}
