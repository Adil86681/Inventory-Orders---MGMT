/**
 * Vercel Serverless Function — /api/inventory
 *
 * Returns paginated Firstbase inventory data as JSON.
 * Auth is handled server-side so credentials never touch the browser.
 *
 * Query params:
 *   ?page=1          page number (default: 1)
 *   ?pageSize=50     items per page (default: 50, max: 200)
 *   ?deployStatus=   filter by deploy status (e.g. DEPLOYED, IN_STORAGE)
 *   ?orgId=          filter by organisation ID
 *   ?search=         search product title (partial match)
 *
 * Deploy: place this file at /api/inventory.js in your Vercel project root.
 * Env vars: set in Vercel dashboard → Settings → Environment Variables
 *   FB_CLIENT_ID     = 0oau04j3bsve6vpjw5d7
 *   FB_CLIENT_SECRET = MiwE0mSx9MiCDT5sc9NRCfKM2svJ0dgGYQljA77dxd5CneM-JzfH_OKW6oP3fMGI
 */

const TOKEN_URL   = "https://auth.firstbasehq.com/oauth2/default/v1/token";
const GRAPHQL_URL = "https://api.firstbasehq.com/graphql";
const SCOPE       = "firstbase:m2m:read-only";

// Simple in-memory token cache (persists for the lifetime of the function instance)
let _cachedToken      = null;
let _cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && now < _cachedTokenExpiry) return _cachedToken;

  const creds  = Buffer.from(
    `${process.env.FB_CLIENT_ID}:${process.env.FB_CLIENT_SECRET}`
  ).toString("base64");

  const resp = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${creds}`,
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token request failed (${resp.status}): ${body}`);
  }

  const data = await resp.json();
  _cachedToken       = data.access_token;
  _cachedTokenExpiry = now + (data.expires_in - 60) * 1000; // refresh 60s early
  return _cachedToken;
}

const INVENTORY_QUERY = `
  query GetInventory($pageNumber: Int!, $pageSize: Int!, $filters: InventoryFilter) {
    getAllInventories(
      pagingAndSorting: {
        pageNumber: $pageNumber
        pageSize:   $pageSize
        sort: [{ field: "createdAt", direction: DESC }]
      }
      inventoryFilter: $filters
    ) {
      total
      data {
        id
        createdAt
        updatedAt
        deployStatus
        deployReason
        conditionStatus
        serialNumber
        renewalDate
        firstbaseSupplied
        orderItemId
        returnOrderItemId
        description
        sku        { id productTitle genericCategory }
        vendor     { id name }
        organization { id name }
        person     { id forename surname }
        warehouse  { id name }
        office     { id name }
        region     { name }
      }
    }
  }
`;

function buildFilters(query) {
  const filters = {};
  if (query.deployStatus) filters.deployStatuses = [query.deployStatus];
  if (query.orgId)        filters.organizationIds = [query.orgId];
  return Object.keys(filters).length ? filters : null;
}

function flattenItem(item) {
  const person    = item.person    || {};
  const warehouse = item.warehouse || {};
  const office    = item.office    || {};
  const sku       = item.sku       || {};
  const vendor    = item.vendor    || {};
  const org       = item.organization || {};
  const region    = item.region    || {};

  let assignedTo = "";
  if (warehouse.name)               assignedTo = warehouse.name;
  else if (office.name)             assignedTo = office.name;
  else if (person.forename || person.surname)
    assignedTo = `${person.forename || ""} ${person.surname || ""}`.trim();

  return {
    inventoryId:        item.id,
    createdAt:          item.createdAt,
    updatedAt:          item.updatedAt,
    productTitle:       sku.productTitle,
    genericCategory:    sku.genericCategory,
    deployStatus:       item.deployStatus,
    deployReason:       item.deployReason,
    conditionStatus:    item.conditionStatus,
    serialNumber:       item.serialNumber,
    renewalDate:        item.renewalDate,
    firstbaseSupplied:  item.firstbaseSupplied,
    orderItemId:        item.orderItemId,
    returnOrderItemId:  item.returnOrderItemId,
    description:        item.description,
    organizationId:     org.id,
    organizationName:   org.name,
    vendorId:           vendor.id,
    vendorName:         vendor.name,
    assignedTo,
    warehouseId:        warehouse.id,
    warehouseName:      warehouse.name,
    personId:           person.id,
    officeId:           office.id,
    region:             region.name,
    skuId:              sku.id,
  };
}

export default async function handler(req, res) {
  // CORS — adjust origin to match your dashboard domain in production
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")    return res.status(405).json({ error: "Method not allowed" });

  const page     = Math.max(1, parseInt(req.query.page     || "1",  10));
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || "50", 10)));
  const filters  = buildFilters(req.query);

  try {
    const token = await getAccessToken();

    const gqlResp = await fetch(GRAPHQL_URL, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        query:     INVENTORY_QUERY,
        variables: { pageNumber: page, pageSize, filters },
      }),
    });

    if (!gqlResp.ok) {
      const text = await gqlResp.text();
      throw new Error(`GraphQL request failed (${gqlResp.status}): ${text.slice(0, 300)}`);
    }

    const body = await gqlResp.json();

    if (body.errors) {
      console.error("GraphQL errors:", body.errors);
      return res.status(502).json({ error: "GraphQL error", details: body.errors });
    }

    const result    = body.data.getAllInventories;
    const items     = (result.data || []).map(flattenItem);
    const totalItems = result.total || 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    return res.status(200).json({
      page,
      pageSize,
      totalItems,
      totalPages,
      items,
    });

  } catch (err) {
    console.error("Inventory API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
