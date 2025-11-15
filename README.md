# Views Asset Manager - After Effects Extension

A CEP extension for Adobe After Effects that allows you to browse and import assets from the Views Asset API directly into your compositions.

## Features

- Browse asset catalog from Views API
- Preview asset thumbnails
- One-click import directly into After Effects
- Automatic asset management with secure downloads

## Setup

### 1. Install the Extension

Copy the `ViewsAssetManager` folder to your CEP extensions directory:

- **Windows**: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`
- **macOS**: `/Library/Application Support/Adobe/CEP/extensions/`

### 2. Configure API Key

The extension requires an API key to authenticate with the Views Asset API.

#### Option A: Set API Key via Script (Recommended)

Create or edit the file at the following location:

**Windows**: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\ViewsAssetManager\client\js\api-config.js`

**macOS**: `/Library/Application Support/Adobe/CEP/extensions/ViewsAssetManager/client/js/api-config.js`

```javascript
// api-config.js
window.VIEWS_ASSET_MANAGER_API_KEY = "your-api-key-here";
```

Then update `index.html` to load this file before `main.js`:

```html
<script src="js/api-config.js"></script>
<script src="js/CSInterface.js"></script>
<script src="js/main.js"></script>
```

#### Option B: Set API Key in index.html

Edit `ViewsAssetManager/client/index.html` and add the following script before loading `main.js`:

```html
<script>
  window.VIEWS_ASSET_MANAGER_API_KEY = "your-api-key-here";
</script>
<script src="js/CSInterface.js"></script>
<script src="js/main.js"></script>
```

### 3. Obtaining an API Key

Contact your Views administrator to obtain an API key. The API supports two types of keys:

- **Admin Key**: Full access to all API features including key management
- **User Key**: Access to asset browsing, downloading, and importing (recommended for extensions)

## API Integration

This extension integrates with the Views Asset API and requires:

- **Authentication**: All requests use `X-API-Key` header
- **Endpoints Used**:
  - `GET /assets` - List all assets
  - `GET /assets/:id/download` - Get presigned download URL (60-second expiration)

### API Response Format

The extension expects assets in the following format:

```json
{
  "assets": [
    {
      "id": "assets/1731672000000-filename.png",
      "name": "filename.png",
      "size": 1024000,
      "thumbnail": "https://bucket.s3.region.amazonaws.com/assets/...",
      "uploadDate": "2025-11-15T12:00:00.000Z"
    }
  ]
}
```

## Usage

1. Open After Effects
2. Go to **Window** > **Extensions** > **Views Asset Manager**
3. The extension will automatically load and display available assets
4. Click **Import** on any asset to add it to your current composition
5. Use the **Refresh** button to reload the asset catalog

## Troubleshooting

### "Missing API key" Error

Make sure you've configured `window.VIEWS_ASSET_MANAGER_API_KEY` before the main script loads. Check the browser console (F12) for detailed error messages.

### Assets Not Loading

1. Verify your API key is valid
2. Check that the API base URL is correct in `main.js` (default: `https://api.viewseditors.com/`)
3. Ensure you have network connectivity to the API server
4. Check the browser console for error messages

### Import Failed

1. Verify the asset exists and hasn't been deleted
2. Check that you have write permissions to the system temp directory
3. Ensure the file is a valid PNG image

## Development

### File Structure

```
ViewsAssetManager/
├── CSXS/
│   └── manifest.xml          # Extension manifest
├── client/
│   ├── css/
│   │   └── styles.css        # UI styles
│   ├── js/
│   │   ├── CSInterface.js    # Adobe CEP interface library
│   │   └── main.js           # Main extension logic
│   └── index.html            # UI markup
└── jsx/
    └── hostscript.jsx        # After Effects scripting logic
```

### Key Functions

- `fetchAssets()` - Retrieves asset catalog from API
- `handleAssetDownload()` - Downloads and imports asset into AE
- `downloadFileAsBase64()` - Converts presigned URL to base64 for temp storage
- `createAssetCard()` - Renders asset card in the UI

## Security Notes

- API keys should be kept secure and not committed to version control
- Consider using user-level API keys rather than admin keys for extensions
- Presigned download URLs expire after 60 seconds for security

## License

© 2025 Views Community. All rights reserved.

