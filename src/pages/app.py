from flask import Flask, request, jsonify
from flask_cors import CORS
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd
import io
import base64
import urllib.request

app = Flask(__name__)
CORS(app)

@app.route('/plot', methods=['POST'])
def generate_plot():
    try:
        data = request.get_json()
        code = data.get('code', '')
        
        if not code:
            return jsonify({'error': 'No code provided'}), 400
        
        # Reset matplotlib state
        plt.clf()
        plt.close('all')

        # Prepare exec environment with common libs
        exec_globals = {
            'plt': plt,
            'sns': sns,
            'np': np,
            'pd': pd
        }

        # --- NEW: support dataset CSV passed inline ---
        # If the client supplied dataset CSV text, load it into df
        dataset_csv = data.get('dataset_csv', None)
        if dataset_csv:
            try:
                # pd.read_csv accepts a file-like object
                df = pd.read_csv(io.StringIO(dataset_csv))
                exec_globals['df'] = df
            except Exception as e:
                # return helpful message if CSV parse fails
                return jsonify({'error': f'Failed to parse dataset_csv: {e}'}), 400

        # --- NEW: support dataset_url pointing to a CSV (fetch & parse) ---
        dataset_url = data.get('dataset_url', None)
        if dataset_url and 'df' not in exec_globals:
            try:
                # Simple fetch via urllib (no extra deps)
                with urllib.request.urlopen(dataset_url) as resp:
                    content_type = resp.headers.get('Content-Type', '')
                    raw = resp.read()
                    # decode using utf-8 fallback
                    text = raw.decode('utf-8', errors='replace')
                    # Try to read into pandas
                    df = pd.read_csv(io.StringIO(text))
                    exec_globals['df'] = df
            except Exception as e:
                return jsonify({'error': f'Failed to fetch/parse dataset_url: {e}'}), 400

        # Execute the provided code with the prepared globals.
        # The code may reference `df` if provided.
        exec(code, exec_globals)
        
        # Save current figure into a buffer and return base64 image
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close()
        
        return jsonify({
            'success': True,
            'image': img_base64
        })
        
    except Exception as e:
        # Return exception message (helpful for debugging). Keep JSON shape consistent.
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
