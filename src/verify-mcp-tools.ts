#!/usr/bin/env node

import "dotenv/config";
import axios from "axios";
import fs from "fs";
import os from "os";
import path from "path";
import { AuthManager, type AuthModeConfig } from "./auth.js";
import { ToolHandlers } from "./handlers.js";

type VerificationResult = {
  tool: string;
  ok: boolean;
  detail?: string;
};

const normalizeAuthMode = (mode: string): AuthModeConfig => {
  const normalized = mode.toLowerCase();
  if (["none", "basic", "device_code", "credentials", "device", "oidc"].includes(normalized)) {
    return normalized as AuthModeConfig;
  }
  return "device_code";
};

const sourceUuid = process.env.VERIFY_SOURCE_UUID || process.argv[3] || "36a42c4c-aa46-43af-847f-7c5ed9682ceb";
const requestedMode = normalizeAuthMode(process.argv[2] || process.env.CATALOGUE_AUTH_MODE || "device_code");
const baseURL = (process.env.BASE_URL || "").replace(/\/$/, "");

if (!baseURL) {
  throw new Error("BASE_URL is required.");
}

const auth = new AuthManager({
  username: process.env.CATALOGUE_USERNAME || "",
  password: process.env.CATALOGUE_PASSWORD || "",
  mode: requestedMode,
  oidcIssuerUrl: process.env.OIDC_ISSUER_URL || "",
  oidcClientId: process.env.OIDC_CLIENT_ID || "",
  oidcClientSecret: process.env.OIDC_CLIENT_SECRET || "",
  oidcScope: process.env.OIDC_SCOPE || "openid profile email",
  deviceCodeTimeoutSeconds: Number(process.env.DEVICE_CODE_TIMEOUT_SECONDS || "300"),
  accessToken: process.env.OIDC_ACCESS_TOKEN || "",
  refreshToken: process.env.OIDC_REFRESH_TOKEN || "",
});

const axiosInstance = axios.create({
  baseURL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 30_000,
});

const handlers = new ToolHandlers(axiosInstance, auth, {
  maxSearchResults: Number(process.env.MAX_SEARCH_RESULTS || "25"),
});

const results: VerificationResult[] = [];

const responseText = (response: any): string => response?.content?.[0]?.text || "";

const parseResponseJson = (response: any): any => {
  const text = responseText(response);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const recordResult = async (tool: string, fn: () => Promise<any>): Promise<any> => {
  try {
    const response = await fn();
    if (response?.isError) {
      results.push({ tool, ok: false, detail: responseText(response).slice(0, 300) });
    } else {
      results.push({ tool, ok: true });
    }
    return response;
  } catch (error: any) {
    results.push({
      tool,
      ok: false,
      detail: String(error.response?.data?.message || error.response?.status || error.message || error).slice(0, 300),
    });
    return undefined;
  }
};

const getSource = async () => {
  const response = await axiosInstance.post("/search/records/_search", {
    query: { term: { uuid: sourceUuid } },
    size: 1,
  });
  const hit = response.data?.hits?.hits?.[0]?._source;
  if (!hit) {
    throw new Error(`Source record not found or not visible: ${sourceUuid}`);
  }
  return hit;
};

const pickTitle = (record: any): string => record?.resourceTitleObject?.default || record?.resourceTitle || record?.title || "";

const pickGroup = (record: any): string => {
  const explicit = process.env.VERIFY_TARGET_GROUP;
  if (explicit) return explicit;
  const groupOwner = record?.groupOwner || record?.groupOwnerId || record?.groupOwnerObject?.id;
  if (groupOwner !== undefined && groupOwner !== null && groupOwner !== "") {
    return String(groupOwner);
  }
  throw new Error("VERIFY_TARGET_GROUP is required because the source record group owner could not be derived.");
};

const pickTagId = (tags: any): number | undefined => {
  const list = Array.isArray(tags) ? tags : tags?.tags || tags?.categories || [];
  for (const tag of list) {
    const id = Number(tag?.id ?? tag?.identifier ?? tag?.value);
    if (Number.isFinite(id)) return id;
  }
  return undefined;
};

const main = async () => {
  console.log(`Verification mode: ${auth.mode}`);
  console.log(`Source UUID: ${sourceUuid}`);

  const source = await getSource();
  const sourceTitle = pickTitle(source);
  const group = pickGroup(source);
  const testTitle = `MCP verification duplicate ${new Date().toISOString()}`;
  let duplicateUuid = "";
  let duplicateTitle = testTitle;
  let tempFile = "";

  await recordResult("search_records", () => handlers.searchRecords({ query: sourceUuid, size: 1 }));
  await recordResult("get_record", () => handlers.getRecord({ uuid: sourceUuid }));
  await recordResult("get_record_summary", () => handlers.getRecordSummary({ uuid: sourceUuid }));
  await recordResult("get_record_formatters", () => handlers.getRecordFormatters({ uuid: sourceUuid }));
  await recordResult("export_record", () => handlers.exportRecord({ uuid: sourceUuid, formatter: "xml", approved: false }));
  await recordResult("list_groups", () => handlers.listGroups({ withReservedGroup: false }));
  await recordResult("get_sources", () => handlers.getSources());
  await recordResult("get_site_info", () => handlers.getSiteInfo());
  await recordResult("get_related_records", () => handlers.getRelatedRecords({ uuid: sourceUuid }));
  const tagsResponse = await recordResult("get_tags", () => handlers.getTags());
  await recordResult("get_regions", () => handlers.getRegions({}));
  await recordResult("search_by_extent", () => handlers.searchByExtent({ minx: -180, miny: -90, maxx: 180, maxy: 90 }));

  try {
    const duplicateResponse = await recordResult("duplicate_record", () => handlers.duplicateRecord({
      metadataUuid: sourceUuid,
      group,
      targetUuid: process.env.VERIFY_TARGET_UUID,
      hasCategoryOfSource: true,
    }));
    const duplicate = parseResponseJson(duplicateResponse);
    duplicateUuid = duplicate?.newUuid || duplicate?.uuid || "";
    if (!duplicateUuid && duplicate?.newId) {
      const lookup = await recordResult("get_record_by_id", () => handlers.getRecordById({ id: Number(duplicate.newId) }));
      duplicateUuid = parseResponseJson(lookup)?.uuid || "";
    }
    if (!duplicateUuid) {
      throw new Error("Duplicate succeeded but no duplicate UUID could be resolved.");
    }

    await recordResult("update_record_title", () => handlers.updateRecordTitle({ uuid: duplicateUuid, title: testTitle }));
    await recordResult("update_record", () => handlers.updateRecord({
      uuid: duplicateUuid,
      xpath: "mdb:identificationInfo/*/mri:citation/cit:CI_Citation/cit:title/gco:CharacterString",
      value: testTitle,
      operation: "replace",
    }));
    duplicateTitle = testTitle;

    const tagId = pickTagId(parseResponseJson(tagsResponse));
    if (tagId !== undefined) {
      await recordResult("add_record_tags", () => handlers.addRecordTags({ uuid: duplicateUuid, tags: [tagId] }));
      await recordResult("delete_record_tags", () => handlers.deleteRecordTags({ uuid: duplicateUuid, tags: [tagId] }));
    } else {
      results.push({ tool: "add_record_tags/delete_record_tags", ok: false, detail: "No numeric tag id found in get_tags response." });
    }

    await recordResult("get_attachments", () => handlers.getAttachments({ metadataUuid: duplicateUuid }));
    tempFile = path.join(os.tmpdir(), `geonetwork-mcp-verify-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, `GeoNetwork MCP verification file for ${duplicateUuid}\n`, "utf8");
    const uploadResponse = await recordResult("upload_file_to_record", () => handlers.uploadFileToRecord({
      metadataUuid: duplicateUuid,
      filePath: tempFile,
      visibility: "private",
      approved: false,
    }));
    const uploaded = parseResponseJson(uploadResponse);
    const rawResourceId = uploaded?.resource?.fileName || uploaded?.resource?.id || path.basename(tempFile);
    const resourceId = String(rawResourceId).split("/").pop() || path.basename(tempFile);
    await recordResult("delete_attachment", () => handlers.deleteAttachment({ metadataUuid: duplicateUuid, resourceId, approved: false }));
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    if (duplicateUuid) {
      await recordResult("delete_record", () => handlers.deleteRecord({
        metadataUuid: duplicateUuid,
        confirmTitle: duplicateTitle,
        confirm: "DELETE",
        withBackup: true,
      }));
    }
  }

  console.log("\nVerification results:");
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.tool}${result.detail ? ` - ${result.detail}` : ""}`);
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`${failed.length} tool verification check(s) failed. Source title was: ${sourceTitle}`);
  }
};

main().catch((error: any) => {
  console.error(error.message || error);
  process.exit(1);
});
