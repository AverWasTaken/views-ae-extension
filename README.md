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

### 2. First Launch

When you first launch the extension, you'll be prompted to enter your API key:

1. Open After Effects
2. Go to **Window** > **Extensions** > **Views Asset Manager**
3. Enter your API key in the setup dialog
4. Click **Save Key** to validate and store your key

The extension will automatically validate your API key before saving it. Your key is stored securely in browser localStorage and persists across sessions.

### 3. Obtaining an API Key

Contact your Views administrator to obtain an API key. The API supports two types of keys:

- **Admin Key**: Full access to all API features including key management
- **User Key**: Access to asset browsing, downloading, and importing (recommended for extensions)

### 4. Managing Your API Key

You can update your API key at any time:

1. Click the **Settings** button (gear icon) in the extension header
2. Enter your new API key
3. Click **Save Key** to validate and update

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
3. Enter your API key on first launch (if not already configured)
4. Browse available assets in the grid view
5. Click **Import** on any asset to add it to your current composition
6. Use the **Refresh** button to reload the asset catalog
7. Click the **Settings** button to change your API key

## Troubleshooting

### "Invalid API key" Error

Your API key may be incorrect or has been revoked:
1. Click the Settings button (gear icon)
2. Enter a valid API key
3. The extension will validate the key before saving

If the problem persists, contact your administrator for a new key.

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
- `validateApiKey()` - Validates API key against the server
- `storeApiKey()` / `getStoredApiKey()` - Manages API key storage in localStorage

## Security Notes

- API keys are stored in browser localStorage (extension-specific storage)
- Keys are validated against the API before being saved
- Consider using user-level API keys rather than admin keys for extensions
- Presigned download URLs expire after 60 seconds for security
- API key visibility can be toggled with the eye icon in the setup dialog

## License

© 2025 Views Community. All rights reserved.

