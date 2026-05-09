import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tools: Tool[] = [
  {
    name: "auth_status",
    description: "Show authentication mode and current login state. This is read-only and does not start a browser login flow.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "auth_login",
    description: "Start or reuse an OIDC Device Code login flow. Open the returned browser URL, enter the user code if needed, then call auth_poll.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "auth_poll",
    description: "Poll the pending OIDC Device Code login once. Call this after completing browser login; if pending, wait for retryAfterSeconds before polling again.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "auth_logout",
    description: "Clear local in-memory authentication tokens and any pending Device Code login state. This does not revoke the identity provider session.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_records",
    description: "Search for metadata records in the EEA catalogue. Supports full Elasticsearch query syntax.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query text (searches across all fields)",
        },
        from: {
          type: "number",
          description: "Starting position for results (default: 0)",
          default: 0,
        },
        size: {
          type: "number",
          description: "Number of results to return (default: 10, max: 100)",
          default: 10,
        },
        bucket: {
          type: "string",
          description: "Filter by specific facet bucket",
        },
        sortBy: {
          type: "string",
          description: "Field to sort by (e.g., 'resourceTitleObject.default.sort')",
        },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order (ascending or descending)",
        },
      },
    },
  },
  {
    name: "get_record",
    description: "Get detailed metadata for a specific record by its UUID or ID",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID or ID of the metadata record",
        },
        approved: {
          type: "boolean",
          description: "Only return approved versions (default: true)",
          default: true,
        },
      },
      required: ["uuid"],
    },
  },
  {
    name: "get_record_summary",
    description: "Get a concise, human-readable summary of a metadata record (title, abstract, keywords, extent, contacts, links). Use this instead of get_record when you only need an overview — the response is much smaller and easier to work with.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
      },
      required: ["uuid"],
    },
  },
  {
    name: "get_record_formatters",
    description: "Get available formatters (export formats) for a metadata record",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
      },
      required: ["uuid"],
    },
  },
  {
    name: "export_record",
    description: "Export a metadata record in a specific format (XML, PDF, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
        formatter: {
          type: "string",
          description: "The formatter/format to use (e.g., 'xml', 'pdf', 'full_view')",
        },
        approved: {
          type: "boolean",
          description: "Use approved version or not (default: true)",
          default: true,
        },
      },
      required: ["uuid", "formatter"],
    },
  },
  {
    name: "list_groups",
    description: "List all groups in the catalogue",
    inputSchema: {
      type: "object",
      properties: {
        withReservedGroup: {
          type: "boolean",
          description: "Include reserved system groups",
          default: false,
        },
      },
    },
  },
  {
    name: "get_sources",
    description: "Get information about catalogue sources (sub-portals)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_site_info",
    description: "Get general information about the catalogue site configuration",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_related_records",
    description: "Get records related to a specific record (parent, children, services, datasets, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
        type: {
          type: "string",
          description: "Type of relationship (e.g., 'children', 'parent', 'services', 'datasets', 'sources', 'associated')",
        },
      },
      required: ["uuid"],
    },
  },
  {
    name: "get_tags",
    description: "Get all available tags/categories in the catalogue",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_regions",
    description: "Get geographic regions/extents available in the catalogue",
    inputSchema: {
      type: "object",
      properties: {
        categoryId: {
          type: "string",
          description: "Filter regions by category ID",
        },
      },
    },
  },
  {
    name: "search_by_extent",
    description: "Search for records by geographic extent (bounding box)",
    inputSchema: {
      type: "object",
      properties: {
        minx: {
          type: "number",
          description: "Minimum longitude (west)",
        },
        miny: {
          type: "number",
          description: "Minimum latitude (south)",
        },
        maxx: {
          type: "number",
          description: "Maximum longitude (east)",
        },
        maxy: {
          type: "number",
          description: "Maximum latitude (north)",
        },
        relation: {
          type: "string",
          enum: ["intersects", "within", "contains"],
          description: "Spatial relationship (default: intersects)",
          default: "intersects",
        },
      },
      required: ["minx", "miny", "maxx", "maxy"],
    },
  },
  {
    name: "duplicate_record",
    description: "Duplicate a metadata record. Creates a copy of an existing record with a new UUID. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying.",
    inputSchema: {
      type: "object",
      properties: {
        metadataUuid: {
          type: "string",
          description: "The UUID of the metadata record to duplicate",
        },
        group: {
          type: "string",
          description: "Target group for the duplicated record",
        },
        isChildOfSource: {
          type: "boolean",
          description: "Set the source record as parent of the new record (default: false)",
          default: false,
        },
        targetUuid: {
          type: "string",
          description: "Specific UUID to use for the duplicated record (optional, will be auto-generated if not provided)",
        },
        hasCategoryOfSource: {
          type: "boolean",
          description: "Copy categories from source record (default: true)",
          default: true,
        },
      },
      required: ["metadataUuid", "group"],
    },
  },
  {
    name: "update_record",
    description: "Update a metadata record field using XPath. Supports replacing, adding, or deleting XML elements. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record to update",
        },
        xpath: {
          type: "string",
          description: "XPath to the element to update. Common paths: 'gmd:identificationInfo/*/gmd:citation/gmd:CI_Citation/gmd:title/gco:CharacterString' for title, 'gmd:identificationInfo/*/gmd:abstract/gco:CharacterString' for abstract",
        },
        value: {
          type: "string",
          description: "The new value. For simple text replacement, just provide the text (e.g., 'New Title'). For XML replacement, provide the full XML element.",
        },
        operation: {
          type: "string",
          enum: ["replace", "add", "delete"],
          description: "Operation type: 'replace' (default), 'add' new element, or 'delete' element",
          default: "replace",
        },
        updateDateStamp: {
          type: "boolean",
          description: "Update the record's date stamp (default: true)",
          default: true,
        },
      },
      required: ["uuid", "xpath", "value"],
    },
  },
  {
    name: "get_record_by_id",
    description: "Get a metadata record by its internal numeric ID. Useful for retrieving the UUID after a duplicate operation returns an ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "The internal numeric ID of the metadata record",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_record_title",
    description: "Update the title of a metadata record. Automatically detects the schema (ISO 19139 or ISO 19115-3) and uses the correct XPath. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record to update",
        },
        title: {
          type: "string",
          description: "The new title for the record",
        },
      },
      required: ["uuid", "title"],
    },
  },
  {
    name: "add_record_tags",
    description: "Add tags (categories) to a metadata record. Use get_tags first to find available tag IDs. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
        tags: {
          type: "array",
          items: { type: "number" },
          description: "Array of tag IDs to add to the record",
        },
      },
      required: ["uuid", "tags"],
    },
  },
  {
    name: "delete_record_tags",
    description: "Remove tags (categories) from a metadata record. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying.",
    inputSchema: {
      type: "object",
      properties: {
        uuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
        tags: {
          type: "array",
          items: { type: "number" },
          description: "Array of tag IDs to remove from the record",
        },
      },
      required: ["uuid", "tags"],
    },
  },
  {
    name: "get_attachments",
    description: "List all attachments/resources for a metadata record",
    inputSchema: {
      type: "object",
      properties: {
        metadataUuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
        sort: {
          type: "string",
          enum: ["type", "name"],
          description: "Sort results by type or name (default: name)",
          default: "name",
        },
        approved: {
          type: "boolean",
          description: "Use approved version or not (default: true)",
          default: true,
        },
        filter: {
          type: "string",
          description: "Filter pattern for attachment names (default: *)",
          default: "*",
        },
      },
      required: ["metadataUuid"],
    },
  },
  {
    name: "delete_attachment",
    description: "Delete a specific attachment from a metadata record. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying.",
    inputSchema: {
      type: "object",
      properties: {
        metadataUuid: {
          type: "string",
          description: "The UUID of the metadata record",
        },
        resourceId: {
          type: "string",
          description: "The ID/filename of the resource to delete",
        },
        approved: {
          type: "boolean",
          description: "Use approved version or not (default: false)",
          default: false,
        },
      },
      required: ["metadataUuid", "resourceId"],
    },
  },
  {
    name: "delete_record",
    description: "Delete a metadata record after verifying its UUID and title. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying. Requires explicit confirm='DELETE' and defaults to withBackup=true.",
    inputSchema: {
      type: "object",
      properties: {
        metadataUuid: {
          type: "string",
          description: "The UUID of the metadata record to delete",
        },
        confirmTitle: {
          type: "string",
          description: "Exact current record title required as a safety check before deletion",
        },
        confirm: {
          type: "string",
          enum: ["DELETE"],
          description: "Must be exactly 'DELETE' to confirm record deletion",
        },
        withBackup: {
          type: "boolean",
          description: "Ask GeoNetwork to create a backup before deletion (default: true)",
          default: true,
        },
      },
      required: ["metadataUuid", "confirmTitle", "confirm"],
    },
  },
  {
    name: "upload_file_to_record",
    description: "Upload a file from your local filesystem directly to a metadata record as an attachment. The file will be uploaded as binary data to GeoNetwork. Requires authentication; if not logged in, call auth_login, complete browser login, then call auth_poll before retrying.",
    inputSchema: {
      type: "object",
      properties: {
        metadataUuid: {
          type: "string",
          description: "The UUID of the metadata record to attach the file to",
        },
        filePath: {
          type: "string",
          description: "Absolute path to the local file to upload (e.g., C:\\Users\\name\\file.pdf or /home/user/file.pdf)",
        },
        visibility: {
          type: "string",
          enum: ["public", "private", "PUBLIC", "PRIVATE"],
          description: "The sharing policy for the file (default: public)",
          default: "public",
        },
        approved: {
          type: "boolean",
          description: "Use approved version or not (default: false)",
          default: false,
        },
      },
      required: ["metadataUuid", "filePath"],
    },
  },
];
