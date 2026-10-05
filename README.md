This is a small React app that searches medicine lables using there brand names by FDA drug label API.

Steps-> 
npm install
npm run dev



## Behavior and trade-offs

Searches require at least 3 characters, run 350 ms after typing stops, and request up to 20 label records.

Successful searches are cached in memory for the current page session. Requests for a replaced search are cancelled so stale results do not take over.

An FDA 404 is treated as an empty search result. Other HTTP/network errors are shown as an error state.
Medicine detail URLs use the FDA record ID (`?medicine=...`) and fetch that record again, so direct links and refreshes work without storing full API responses in the URL.

Cards and detail pages display medicine data only from each response's `openfda` object. Missing data is shown as “Not listed.”
