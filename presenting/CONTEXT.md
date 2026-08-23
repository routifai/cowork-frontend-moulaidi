# Presenting

The Hypatia PowerPoint Builder's frontend: sidebar entry point and editor UI, ported from the open-source Presenton project's React components and reskinned with Hypatia's design tokens. Encapsulated in this folder so the feature can be removed by deleting it plus a small number of integration points.

## Language

**Hypatia PowerPoint Builder**:
The feature's name, as it appears in the sidebar and to the user. Opens as an Embedded Panel, not a separate window.
_Avoid_: "Presenton" (the upstream project this was ported from, not the feature's identity in this app), "the PPT feature" (informal, use the full name in code/docs).

**Embedded Panel**:
This feature's entry-surface pattern — it opens as a view inside Hypatia's existing shell chrome (sidebar and nav stay visible), not a new window and not a full takeover with its own separate top-level chrome.
_Avoid_: "modal", "standalone view".

**Preset Template**, **Uploaded Template**:
Defined in the [Presenting](../../hypatia-backend/presenting/CONTEXT.md) context on the backend — the two entry paths into building a presentation. Definitions live there since the Presenting Engine owns template parsing and the bundled template packs; not duplicated here.
