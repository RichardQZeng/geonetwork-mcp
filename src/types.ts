export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export interface SearchRecordsArgs {
  query?: string;
  from?: number;
  size?: number;
  bucket?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GetRecordArgs {
  uuid: string;
  approved?: boolean;
}

export interface GetRecordSummaryArgs {
  uuid: string;
}

export interface GetRecordFormattersArgs {
  uuid: string;
}

export interface ExportRecordArgs {
  uuid: string;
  formatter: string;
  approved?: boolean;
}

export interface ListGroupsArgs {
  withReservedGroup?: boolean;
}

export interface GetRelatedRecordsArgs {
  uuid: string;
  type?: string;
}

export interface GetRegionsArgs {
  categoryId?: string;
}

export interface SearchByExtentArgs {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
  relation?: "intersects" | "within" | "contains";
}

export interface DuplicateRecordArgs {
  metadataUuid: string;
  group?: string;
  isChildOfSource?: boolean;
  targetUuid?: string;
  hasCategoryOfSource?: boolean;
}

export interface UpdateRecordArgs {
  uuid: string;
  xpath: string;
  value: string;
  operation?: "replace" | "add" | "delete";
  updateDateStamp?: boolean;
}

export interface GetRecordByIdArgs {
  id: number;
}

export interface UpdateRecordTitleArgs {
  uuid: string;
  title: string;
}

export interface AddRecordTagsArgs {
  uuid: string;
  tags: number[];
}

export interface DeleteRecordTagsArgs {
  uuid: string;
  tags: number[];
}

export interface GetAttachmentsArgs {
  metadataUuid: string;
  sort?: "type" | "name";
  approved?: boolean;
  filter?: string;
}

export interface DeleteAttachmentArgs {
  metadataUuid: string;
  resourceId: string;
  approved?: boolean;
}

export interface UploadFileToRecordArgs {
  metadataUuid: string;
  filePath: string;
  visibility?: "public" | "private" | "PUBLIC" | "PRIVATE";
  approved?: boolean;
}

export interface DeleteRecordArgs {
  metadataUuid: string;
  confirmTitle: string;
  confirm: "DELETE";
  withBackup?: boolean;
}

export interface HandlerConfig {
  maxSearchResults: number;
}
