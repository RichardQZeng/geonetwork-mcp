# GeoNetwork MCP Server

A Model Context Protocol (MCP) server that provides tools to interact with a GeoNetwork Catalogue API (tested with GeoNetwork 4.4.9).

## Features

This MCP server provides 21 tools for interacting with GeoNetwork:

### Search & Discovery
- **search_records** - Search for metadata records with full Elasticsearch query support
- **search_by_extent** - Find records by geographic bounding box
- **get_record** - Retrieve detailed metadata for a specific record by UUID
- **get_record_by_id** - Retrieve a record by its internal numeric ID
- **get_related_records** - Find related records (parent, children, services, datasets)

### Data Export & Management
- **get_record_formatters** - List available export formats for a record
- **export_record** - Export metadata in various formats (XML, PDF, etc.)
- **duplicate_record** - Duplicate an existing metadata record (requires authentication)

### Record Editing (Requires Authentication)
- **update_record** - Update any field using XPath (supports ISO 19139 and ISO 19115-3)
- **update_record_title** - Simplified tool to update a record's title (auto-detects schema)
- **add_record_tags** - Add tags/categories to a record
- **delete_record_tags** - Remove tags/categories from a record
- **delete_record** - Guarded full-record delete requiring exact title confirmation and `confirm="DELETE"`

### Resource/Attachment Management
- **upload_file_to_record** - Upload a file from local filesystem directly to a metadata record (requires authentication)
- **get_attachments** - List all attachments/resources for a metadata record
- **delete_attachment** - Delete a specific attachment from a record (requires authentication)

### Catalogue Information
- **get_site_info** - Get catalogue configuration and site information
- **get_sources** - List catalogue sources and sub-portals
- **list_groups** - List all user groups
- **get_tags** - Get available tags/categories
- **get_regions** - Get geographic regions/extents

## Installation

### Option 1: Manual Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Configure environment variables:
```bash
# Create a .env file in the project root
PORT=3001
BASE_URL=https://your-geonetwork.example/geonetwork/srv/api
MAX_SEARCH_RESULTS=20

# Recommended: OIDC Device Code authentication for real-user bearer auth
CATALOGUE_AUTH_MODE=device_code
OIDC_ISSUER_URL=https://your-keycloak.example/realms/your-realm
OIDC_CLIENT_ID=geonetwork
OIDC_CLIENT_SECRET=your_client_secret
# Add offline_access if your identity provider requires it for refresh tokens
# OIDC_SCOPE="openid profile email offline_access"

# Legacy Basic/session authentication, only for deployments that allow it
# CATALOGUE_AUTH_MODE=basic
# CATALOGUE_USERNAME=your_username
# CATALOGUE_PASSWORD='your_password'

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Note:** For passwords containing special characters (`$`, `#`, etc.), wrap the value in single quotes.

### Option 2: Docker

The easiest way to run the server is using Docker:

```bash
# Build and start the container
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop the container
docker-compose down
```

The server will be available at `http://localhost:3001`

**Environment Variables:**
You can customize the configuration by creating a `.env` file or editing `docker-compose.yml`:

```yaml
environment:
  - PORT=3001
  - BASE_URL=https://your-geonetwork.example/geonetwork/srv/api
  - MAX_SEARCH_RESULTS=100
  - CATALOGUE_AUTH_MODE=device_code
  - OIDC_ISSUER_URL=https://your-keycloak.example/realms/your-realm
  - OIDC_CLIENT_ID=geonetwork
  - OIDC_CLIENT_SECRET=your_client_secret
```

## Authentication

Protected tools support Keycloak/OIDC Device Code bearer auth first, with legacy Basic/session credentials as a secondary option for deployments that still allow it.

### OIDC Device Code Mode

Device Code mode uses real-user bearer tokens and is the recommended path for Keycloak/OIDC GeoNetwork deployments:

```bash
BASE_URL=https://your-geonetwork.example/geonetwork/srv/api
MAX_SEARCH_RESULTS=100
CATALOGUE_AUTH_MODE=device_code
OIDC_ISSUER_URL=https://your-keycloak.example/realms/your-realm
OIDC_CLIENT_ID=geonetwork
OIDC_CLIENT_SECRET=your_client_secret
# Optional: request refresh tokens if your IdP requires this scope
# OIDC_SCOPE="openid profile email offline_access"

# Optional: seed tokens from a secure runtime environment
# OIDC_ACCESS_TOKEN=...
# OIDC_REFRESH_TOKEN=...
```

Behavior:

- The first authenticated tool call prompts with a browser login URL and user code.
- Tokens are cached in memory for the MCP server process.
- Refresh tokens are used silently if the identity provider returns them.
- Env-supplied `OIDC_ACCESS_TOKEN` / `OIDC_REFRESH_TOKEN` values are used only for this process and still expire according to the identity provider's token lifetime.
- Some identity providers require `offline_access` in `OIDC_SCOPE` before they issue refresh tokens.
- Restarting the MCP server loses in-memory tokens and prompts again on the next authenticated call.
- Mutating requests include GeoNetwork CSRF handling: `XSRF-TOKEN` cookie plus `X-XSRF-TOKEN` header.

### Legacy Basic Credentials Mode

Username/password Basic or session auth may not work when GeoNetwork is configured as OIDC-only. Use this mode only for deployments that explicitly allow username/password API authentication.

```bash
BASE_URL=https://your-geonetwork.example/geonetwork/srv/api
CATALOGUE_AUTH_MODE=basic
CATALOGUE_USERNAME=your_username
CATALOGUE_PASSWORD='your_password'
```

### No Auth Mode

```bash
CATALOGUE_AUTH_MODE=none
```

Use only for public/read-only catalogue access.

Do not commit real service URLs, passwords, client secrets, bearer tokens, or refresh tokens.

## Usage

### Streamable HTTP Server (MCP Transport)

The server uses the official MCP Streamable HTTP transport with Server-Sent Events (SSE).

**Start the server:**
```bash
npm start
```

The server will start on port 3001 (or the port specified in the `PORT` environment variable).

**Available endpoints:**
- `GET http://localhost:3001/health` - Health check endpoint
- `GET http://localhost:3001/info` - Server information
- `POST http://localhost:3001/upload` - Upload file to basket (multipart/form-data)
- `GET http://localhost:3001/uploads/:filename` - Retrieve uploaded file
- `POST http://localhost:3001/` - MCP message endpoint (standard JSON-RPC)
- `GET http://localhost:3001/` - MCP SSE stream endpoint (for server-initiated messages)

**Testing the server:**
```bash
# Check if server is running
curl http://localhost:3001/health

# Should return: {"status":"ok","service":"geonetwork-mcp"}

# Upload a file to the basket
curl -X POST http://localhost:3001/upload -F "file=@myfile.pdf"

# Returns: {"success":true,"file":{"url":"http://localhost:3001/uploads/myfile-123456789.pdf",...}}
```

### Upload Basket

The server includes a built-in upload basket for temporary file storage. This allows you to upload files first, then attach them to metadata records using the URL.

**Swagger UI (Easiest Method):**
1. Open `http://localhost:3001/api-docs` in your browser
2. Expand the "POST /upload" endpoint
3. Click "Try it out"
4. Select a file and click "Execute"
5. Copy the returned URL from the response if another workflow needs it

**How it works:**
1. Upload a file via `POST /upload` endpoint (or use Swagger UI)
2. Server stores the file in the `uploads/` directory
3. Server returns a URL: `http://localhost:3001/uploads/filename`
4. Use direct local paths with `upload_file_to_record` when attaching files through MCP

**Configuration:**
```bash
# Optional environment variables
UPLOAD_DIR=./uploads           # Upload directory (default: ./uploads)
MAX_FILE_SIZE=104857600        # Max file size in bytes (default: 100MB)
```

**Swagger UI:**
- Access the interactive API documentation and file upload interface at:
- `http://localhost:3001/api-docs`

### With OpenCode

This server currently exposes MCP over Streamable HTTP, so configure OpenCode as a remote MCP server and start this process separately.

Add this entry under the `mcp` object in your OpenCode config, for example `C:\Users\<you>\.config\opencode\opencode.jsonc` on Windows:

```jsonc
{
  "mcp": {
    "geonetwork-mcp": {
      "type": "remote",
      "url": "http://localhost:3001/",
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

Start the server separately:

```powershell
cd D:\Geospatial\geonetwork-mcp
npm run build
npm start
```

The server reads `BASE_URL`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and other settings from its own process environment. You do not need to put OIDC secrets in the OpenCode config if they are already available as Windows user/system environment variables.

### With Other MCP Clients

Use an MCP client that supports Streamable HTTP and point it at:

```text
http://localhost:3001/
```

The current `dist/index.js` entrypoint is not a stdio MCP server. Local stdio configs such as `command: node` plus `args: ["dist/index.js"]` are not supported unless a separate stdio entrypoint is added.

## Example Queries

Once connected from an MCP client, you can ask questions like:

- "Search the catalogue for datasets about air quality"
- "Find all metadata records within the bounding box of Europe"
- "Get detailed information about record UUID abc-123-def"
- "Export this metadata record as XML"
- "What geographic regions are available in the catalogue?"
- "Show me all datasets related to this parent record"

## API Base URL

Set the target GeoNetwork API with `BASE_URL`:

```bash
BASE_URL=https://your-geonetwork.example/geonetwork/srv/api
```

`BASE_URL` is required for the server and verification scripts. `MAX_SEARCH_RESULTS` caps `search_records` responses to avoid very large MCP payloads; `100` is a practical default for interactive use.

## Development

### Commands

- **Build**: `npm run build` - Compile TypeScript to dist/
- **Watch mode**: `npm run dev` - Compile TypeScript in watch mode (auto-recompile on changes)
- **Start**: `npm start` - Run the compiled server
- **Verify Device Code read auth**: `npm run verify:device-code`
- **Verify all tools with Device Code**: `npm run verify:tools -- device_code`
- **Verify all tools with credentials**: `npm run verify:tools -- basic`

Tool verification uses a safe duplicate-based workflow. Configure a source record UUID and, if it cannot be derived, a target group:

```bash
VERIFY_SOURCE_UUID=source-record-uuid
VERIFY_TARGET_GROUP=target-group-id
npm run verify:tools -- device_code
```

If `VERIFY_SOURCE_UUID` is not set, the verifier falls back to a developer-catalog UUID used for this repository's test GeoNetwork. Set `VERIFY_SOURCE_UUID` explicitly before running against another catalogue.

### Development Workflow

For active development, run two commands in separate terminals:

**Terminal 1** - Compile TypeScript in watch mode:
```bash
npm run dev
```

**Terminal 2** - Start the server:
```bash
npm start
```

This way, TypeScript will automatically recompile when you make changes, and you can restart the server to pick up the new changes.

### Architecture

The server uses the official MCP SDK with Streamable HTTP transport (stateless mode):
- **Express server** handles HTTP endpoints with CORS support
- **MCP Server** handles tool requests via Streamable HTTP/SSE
- **Axios client** communicates with the GeoNetwork API (30s timeout)
- **Auth manager** supports credentials and Device Code bearer auth with CSRF handling
- **Modular design** with separate files:
  - `src/index.ts` - Server setup and routing
  - `src/auth.ts` - Authentication and CSRF helper
  - `src/tools.ts` - Tool definitions (21 tools)
  - `src/handlers.ts` - Tool implementation handlers
  - `src/types.ts` - TypeScript interfaces
  - `src/verify-mcp-tools.ts` - Safe duplicate-based tool verifier

## Tools Reference

### search_records
Search for metadata records in the catalogue.

**Parameters:**
- `query` (string): Search text
- `from` (number): Starting position (default: 0)
- `size` (number): Number of results (default: 10, max: 100)
- `bucket` (string): Filter by facet bucket
- `sortBy` (string): Sort field
- `sortOrder` (string): "asc" or "desc"

### get_record
Get detailed metadata for a specific record.

**Parameters:**
- `uuid` (string, required): Record UUID or ID
- `approved` (boolean): Only approved versions (default: true)

### search_by_extent
Search records by geographic extent.

**Parameters:**
- `minx` (number, required): Minimum longitude (west)
- `miny` (number, required): Minimum latitude (south)
- `maxx` (number, required): Maximum longitude (east)
- `maxy` (number, required): Maximum latitude (north)
- `relation` (string): Spatial relationship - "intersects", "within", or "contains" (default: "intersects")

### export_record
Export a metadata record in a specific format.

**Parameters:**
- `uuid` (string, required): Record UUID
- `formatter` (string, required): Format identifier (e.g., "xml", "pdf", "full_view")
- `approved` (boolean, optional): Use approved version or not (default: true)

Use `get_record_formatters` first to see available formats for a record.

### duplicate_record
Duplicate an existing metadata record with a new UUID. **Requires authentication.**

**Parameters:**
- `metadataUuid` (string, required): UUID of the record to duplicate
- `group` (string, required): Target group for the duplicated record
- `isChildOfSource` (boolean, optional): Set the source record as parent of the new record (default: false)
- `targetUuid` (string, optional): Specific UUID to use for the duplicated record (auto-generated if not provided)
- `hasCategoryOfSource` (boolean, optional): Copy categories from source record (default: true)

### get_record_by_id
Retrieve a metadata record by its internal numeric ID. Useful for getting the UUID after a duplicate operation.

**Parameters:**
- `id` (number, required): Internal numeric ID of the record

### update_record
Update a metadata record field using XPath. **Requires authentication.**

**Parameters:**
- `uuid` (string, required): UUID of the record to update
- `xpath` (string, required): XPath to the element to update
- `value` (string, required): New value (text for simple replacement, or full XML element)
- `operation` (string, optional): Operation type - "replace" (default), "add", or "delete"
- `updateDateStamp` (boolean, optional): Update the record's timestamp (default: true)

**Common XPaths:**
- ISO 19139 title: `gmd:identificationInfo/*/gmd:citation/gmd:CI_Citation/gmd:title/gco:CharacterString`
- ISO 19115-3 title: `mdb:identificationInfo/*/mri:citation/cit:CI_Citation/cit:title/gco:CharacterString`

### update_record_title
Simplified tool to update a record's title. Automatically detects the schema (ISO 19139 or ISO 19115-3) and uses the correct XPath. **Requires authentication.**

**Parameters:**
- `uuid` (string, required): UUID of the record to update
- `title` (string, required): New title for the record

### add_record_tags
Add tags (categories) to a metadata record. **Requires authentication.**

**Parameters:**
- `uuid` (string, required): UUID of the record
- `tags` (array of numbers, required): Array of tag IDs to add

Use `get_tags` first to find available tag IDs.

### delete_record_tags
Remove tags (categories) from a metadata record. **Requires authentication.**

**Parameters:**
- `uuid` (string, required): UUID of the record
- `tags` (array of numbers, required): Array of tag IDs to remove

### delete_record
Delete a metadata record. **Requires authentication.** This is intentionally guarded because it removes the record itself.

**Parameters:**
- `metadataUuid` (string, required): UUID of the record to delete
- `confirmTitle` (string, required): Exact current title of the record
- `confirm` (string, required): Must be exactly `DELETE`
- `withBackup` (boolean, optional): Ask GeoNetwork to create a backup before delete (default: true)

**Safety behavior:**
- Searches by UUID first
- Refuses to delete unless exactly one matching record is found
- Refuses to delete unless the current title exactly matches `confirmTitle`
- Sends GeoNetwork CSRF cookie/header for the mutating request
- Verifies post-delete search result

### upload_file_to_record
Upload a file from your local filesystem directly to a metadata record as an attachment. The file is uploaded as binary data to GeoNetwork. **Requires authentication.**

**Parameters:**
- `metadataUuid` (string, required): UUID of the metadata record to attach the file to
- `filePath` (string, required): Absolute path to the local file (e.g., `C:\Users\name\document.pdf` or `/home/user/document.pdf`)
- `visibility` (string, optional): The sharing policy - `public` or `private` (default: public)
- `approved` (boolean, optional): Use approved version or not (default: false)

**Example:**
```
metadataUuid: "43d7c186-2187-4bcd-8843-41e575a5ef56"
filePath: "C:\\Documents\\myfile.pdf"
```

**Note:** This tool directly uploads the file to GeoNetwork. The file must be accessible on the machine running the MCP server.

### get_attachments
List all attachments/resources for a metadata record.

**Parameters:**
- `metadataUuid` (string, required): UUID of the metadata record
- `sort` (string, optional): Sort results by "type" or "name" (default: name)
- `approved` (boolean, optional): Use approved version or not (default: true)
- `filter` (string, optional): Filter pattern for attachment names (default: *)

**Returns:** Array of attachment objects with details like filename, type, URL, size, etc.

### delete_attachment
Delete a specific attachment from a metadata record. **Requires authentication.**

**Parameters:**
- `metadataUuid` (string, required): UUID of the metadata record
- `resourceId` (string, required): The ID/filename of the resource to delete
- `approved` (boolean, optional): Use approved version or not (default: false)

**Note:** Use `get_attachments` first to find the exact resourceId of the attachment you want to delete.

## License

MIT

## Related Links

- [GeoNetwork Documentation](https://geonetwork-opensource.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
