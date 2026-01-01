// Konfiguration Handler für User-Config

const { GENRES } = require('./manifest');

class ConfigHandler {
    /**
     * Erstellt eine Konfigurationsseite für den User
     */
    static getConfigHTML() {
        return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DE Mediatheken Konfiguration</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            padding: 40px;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .section {
            margin-bottom: 30px;
        }
        
        .section-title {
            color: #444;
            font-size: 18px;
            margin-bottom: 15px;
            font-weight: 600;
            border-bottom: 2px solid #667eea;
            padding-bottom: 8px;
        }
        
        .checkbox-group {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 12px;
            margin-bottom: 15px;
        }
        
        .checkbox-item {
            display: flex;
            align-items: center;
        }
        
        .checkbox-item input[type="checkbox"] {
            margin-right: 8px;
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
        
        .checkbox-item label {
            cursor: pointer;
            font-size: 14px;
            color: #555;
        }
        
        .input-group {
            margin-bottom: 15px;
        }
        
        .input-group label {
            display: block;
            margin-bottom: 6px;
            color: #555;
            font-size: 14px;
            font-weight: 500;
        }
        
        .input-group input[type="number"] {
            width: 100%;
            padding: 10px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        
        .input-group input[type="number"]:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .buttons {
            display: flex;
            gap: 10px;
            margin-top: 30px;
        }
        
        button {
            flex: 1;
            padding: 14px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        button:active {
            transform: translateY(0);
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-secondary {
            background: #f5f5f5;
            color: #666;
        }
        
        .info {
            background: #f0f4ff;
            border-left: 4px solid #667eea;
            padding: 12px 16px;
            margin-top: 20px;
            border-radius: 4px;
            font-size: 13px;
            color: #555;
        }
        
        .select-all {
            margin-bottom: 10px;
        }
        
        .select-all button {
            padding: 8px 16px;
            font-size: 13px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 DE Mediatheken</h1>
        <p class="subtitle">Passe das Add-on nach deinen Wünschen an</p>
        
        <form id="configForm">
            <!-- Sender Whitelist -->
            <div class="section">
                <h2 class="section-title">📺 Sender Auswahl</h2>
                <div class="select-all">
                    <button type="button" onclick="selectAllSenders()">Alle auswählen</button>
                    <button type="button" onclick="deselectAllSenders()">Alle abwählen</button>
                </div>
                <div class="checkbox-group" id="senderCheckboxes">
                    ${this._generateSenderCheckboxes()}
                </div>
            </div>
            
            <!-- Mindestdauer -->
            <div class="section">
                <h2 class="section-title">⏱️ Inhalts-Filter</h2>
                <div class="input-group">
                    <label for="minDuration">Mindestdauer (Minuten)</label>
                    <input type="number" id="minDuration" name="minDuration" 
                           min="0" max="300" value="5" step="1">
                    <small style="color: #888; display: block; margin-top: 4px;">
                        Zeige nur Inhalte mit mindestens dieser Länge
                    </small>
                </div>
            </div>
            
            <!-- Buttons -->
            <div class="buttons">
                <button type="button" class="btn-secondary" onclick="resetDefaults()">
                    Zurücksetzen
                </button>
                <button type="submit" class="btn-primary">
                    Konfiguration Speichern
                </button>
            </div>
            
            <div class="info">
                💡 <strong>Tipp:</strong> Deine Konfiguration wird in der Add-on URL gespeichert. 
                Du musst das Add-on neu installieren, um die Änderungen zu übernehmen.
            </div>
        </form>
        
        <div id="result" style="margin-top: 20px;"></div>
    </div>
    
    <script>
        const SENDERS = ${JSON.stringify(this._getSenders())};
        
        function selectAllSenders() {
            document.querySelectorAll('#senderCheckboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = true;
            });
        }
        
        function deselectAllSenders() {
            document.querySelectorAll('#senderCheckboxes input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
        }
        
        function resetDefaults() {
            selectAllSenders();
            document.getElementById('minDuration').value = 5;
        }
        
        // Load config from URL
        function loadConfig() {
            const params = new URLSearchParams(window.location.search);
            
            // Sender
            const senders = params.get('senders');
            if (senders) {
                const selectedSenders = senders.split(',');
                document.querySelectorAll('#senderCheckboxes input[type="checkbox"]').forEach(cb => {
                    cb.checked = selectedSenders.includes(cb.value);
                });
            } else {
                selectAllSenders();
            }
            
            // Min Duration
            const minDuration = params.get('minDuration');
            if (minDuration) {
                document.getElementById('minDuration').value = minDuration;
            }
        }
        
        // Save config
        document.getElementById('configForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Collect selected senders
            const selectedSenders = [];
            document.querySelectorAll('#senderCheckboxes input[type="checkbox"]:checked').forEach(cb => {
                selectedSenders.push(cb.value);
            });
            
            const minDuration = document.getElementById('minDuration').value;
            
            // Build config URL
            const config = {
                senders: selectedSenders.join(','),
                minDuration: minDuration
            };
            
            const configEncoded = btoa(JSON.stringify(config));
            const installUrl = window.location.origin + '/' + configEncoded + '/manifest.json';
            
            // Show result
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = \`
                <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; border-left: 4px solid #4caf50;">
                    <h3 style="color: #2e7d32; margin-bottom: 10px;">✅ Konfiguration erstellt!</h3>
                    <p style="color: #555; margin-bottom: 12px;">
                        Kopiere diese URL und installiere das Add-on in Stremio:
                    </p>
                    <input type="text" readonly value="\${installUrl}" 
                           style="width: 100%; padding: 10px; border: 2px solid #4caf50; border-radius: 4px; font-family: monospace; font-size: 12px;"
                           onclick="this.select()">
                    <button onclick="navigator.clipboard.writeText('\${installUrl}')" 
                            style="margin-top: 10px; padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        📋 In Zwischenablage kopieren
                    </button>
                </div>
            \`;
            
            resultDiv.scrollIntoView({ behavior: 'smooth' });
        });
        
        // Load config on page load
        loadConfig();
    </script>
</body>
</html>
        `;
    }

    /**
     * Generiert Sender-Checkboxes
     */
    static _generateSenderCheckboxes() {
        const senders = this._getSenders();
        
        return senders.map(sender => `
            <div class="checkbox-item">
                <input type="checkbox" id="sender_${sender}" name="senders" value="${sender}" checked>
                <label for="sender_${sender}">${sender}</label>
            </div>
        `).join('');
    }

    /**
     * Gibt Liste der Sender zurück
     */
    static _getSenders() {
        return GENRES.filter(g => 
            ['ARD', 'ZDF', 'arte', '3sat', 'WDR', 'NDR', 'BR', 'SWR', 'MDR', 'HR', 'RBB'].includes(g)
        );
    }

    /**
     * Parsed die Konfiguration aus dem Request
     */
    static parseConfig(configString) {
        if (!configString) {
            return this.getDefaultConfig();
        }

        try {
            const decoded = Buffer.from(configString, 'base64').toString('utf8');
            const config = JSON.parse(decoded);
            
            return {
                senders: config.senders ? config.senders.split(',') : this._getSenders(),
                minDuration: parseInt(config.minDuration) || 5
            };
        } catch (error) {
            return this.getDefaultConfig();
        }
    }

    /**
     * Default-Konfiguration
     */
    static getDefaultConfig() {
        return {
            senders: this._getSenders(),
            minDuration: 5
        };
    }
}

module.exports = ConfigHandler;
