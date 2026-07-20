# Interactive KP — Document Import Edition

This document preserves the useful product concept from the former
`interactive-kp-import` repository. Import should be developed as an edition or
feature of the main `interactive-kp` product rather than as a duplicated codebase.

## Product boundary

- `interactive-kp` remains the core product for creating and approving interactive commercial proposals.
- The import edition adds document recognition and import from Excel and PDF.
- Accounting and CRM capabilities remain separate products or integrations.

## Import workflow

1. A manager uploads an Excel or PDF estimate.
2. The service extracts proposal metadata, furniture positions, dimensions, descriptions, quantities, prices, and embedded images.
3. Extracted data is shown in a review screen with confidence indicators and source-cell references.
4. The manager corrects uncertain fields and confirms the import.
5. Only confirmed data is saved as a new draft proposal.

## Delivery order

1. Excel import for structured estimates with embedded images.
2. Template-independent Excel field detection and validation.
3. PDF text and table extraction.
4. OCR for scanned PDFs.
5. Optional export and integration API for future CRM products.

## Safety rule

Import must never silently publish a proposal. Imported data always enters the
system as a draft and requires manager confirmation.
