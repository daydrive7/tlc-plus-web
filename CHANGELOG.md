# Changelog

## 1.3.5 — road type spans

- Added a road type tool to place complete documented spans on the track, with drag/select/delete, orientation, undo/redo and project/vault persistence.
- Added 26 curated road types for Andalusia, Eifel/Flat and Death Valley. Restaurant/parking uses the documented 150 m nominal road span. Multipart types preserve their complete ordered chain.
- Protected start/finish road UUIDs and flags, rejected overlaps/out-of-range spans and preserved plan-to-height distance conversion.
- Added exact existing-TED section UUID editing under File, with only documented single-piece types for the file's scenery. Original section lengths and unrelated bytes are preserved.
- Added byte-preservation, placement/export, persistence and browser interaction tests. In-game appearance remains unverified. Python code is unchanged.

## 1.3.4 — privacy and accessibility (release candidate)

- Add a linked privacy policy, cookie/browser-storage inventory and controls, terms of use, and accessibility information with a public project contact.
- Disable persistent preference access by default; enable it only after an explicit choice. Remember allow/refuse choices for 180 days and support withdrawal across tabs.
- Keep requested browser track saves independent of optional preferences; add confirmed bulk deletion and explain local-save limits and GitHub hosting logs.
- Add labelled controls and canvas descriptions, decorative icon semantics, visible keyboard focus, accessible tab/menu navigation, modal focus handling and reduced motion.
- Add a form-based track-point editor and keyboard elevation-panel resizing.
- Preserve MIT notices, the existing export formats and desktop compatibility, and document legal/rights questions that remain for maintainer review.

See [release review](docs/v1.3.4-release-review.md) before publishing this candidate. These changes do not establish legal compliance or guarantee protection from claims.
