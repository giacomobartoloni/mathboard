# 0013. Plot-local numeric parameters and conditional BoardDocument v3

- Status: proposed for review (implemented on the F039 parameter branch, not merged)
- Date: 2026-11-09
- Context: F039 interactive parameter bindings; follows [ADR 0012](0012-semantic-plots-and-document-v2.md)

## Context

F039's merged Plot implementation parses source LaTeX into noncanonical CortexJS MathJSON
and evaluates a bounded real-valued subset with MathBoard's own interpreter. BoardDocument
v2 stores parameterless semantic Plots, while the merged Local Agent/native MCP interface
has a closed public Plot contract. The user wants adjustable local numeric parameters,
with no product requirement for an arbitrary maximum of three.

Writing new parameter fields into v2 would create a silent-data-loss risk for older
readers that can parse a Plot but do not understand its free symbols. Numeric values
must also not be substituted into the original LaTeX or assigned into a shared mutable
CortexJS symbol table.

## Proposed decision

1. Each Plot may optionally store a variable-length parameters array of records
   with fields symbol, value, min, max and step. Every field is required within a record.
   No source MathJSON, generated path, UI draft value or Worker cache is persisted.
   An absent or empty array retains legacy static Plot semantics. Parameter values are
   local to the Plot; names never implicitly link separate Plots.
2. Maintain one real independent variable x for the existing explicit y=f(x) Plot
   grammar. Bind declared scalar symbols through an immutable per-render numeric
   environment in the bounded MathJSON interpreter. The same snapshot must feed
   numerical sampling and continuity guards. The old parsePlotExpression(latex)
   API continues to handle parameterless Plots.
3. Keep the existing 256 AST-node/visit budget; parameter records cannot exceed that
   existing computation budget, but **three is not a parameter-count rule**. Validate
   each finite numeric value and slider range, and set a practical per-slider tick
   budget. The initial identifier spelling policy is an explicitly versioned subset
   compatible with pinned CortexJS parsing; identifiers are validated from MathJSON
   symbol leaves, never inferred by replacing or regex-scanning LaTeX.
4. Write **BoardDocument v1** for plot-free scenes, **v2** for scenes with only
   parameterless Plots, and **v3** whenever a Plot with nonempty parameters occurs,
   including recursively within groups. The new reader accepts v1/v2/v3 and rejects
   any older declared document version containing newer Plot semantics.
   Existing v2 readers will reject version 3 as unsupported; they must not be given
   a v2 document with parameterized Plots. When the last parameterized Plot is
   removed or its parameters are cleared, a subsequent save may return to v2/v1
   according to current semantic objects.
5. Keep Stamp v1's explicit rejection of Plots. Plot clone, group, reload and Undo
   use the authoritative semantic parameter definitions and atomic replacement.
6. Extend **existing** Local Agent/native MCP create, createMany, update, observe
   and discovery with the optional parameter array. Reuse the canonical PLOT_KEYS
   field list, closed public create allowlist and Plot patch schema.
   Do not introduce new Plot-specific methods. Preserve the merged trusted
   request deadlines, concurrency admission, cancellation, active/inactive
   board behavior and history guarantees.
7. A valid parameter state with no real samples inside the selected mathematical
   window is a valid empty Plot (derived no_real_samples status), allowing values
   to move back into range. Keep previous static Plot rejection behavior.
   This status is derived observation metadata, never persistent document state.

## Consequences

- Old v1/v2 documents stay readable and retain their original version until
  their semantic contents require a higher one.
- Older applications cannot edit new v3 documents until upgraded. This is
  deliberate explicit rejection rather than hidden parameter loss.
- Full on-board slider controls and a warm interactive Worker are separate
  subsequent UI concerns. The merged trusted API coordinator is not a slider
  animation engine.
- Real-domain discontinuity behavior remains bounded and conservative; sampling
  cannot prove global continuity.
- UI/default range policy, lexical identifier extensions and measured performance
  thresholds can evolve in separately reviewed follow-ups.

## Verification gates

Unit tests must pin CortexJS 0.173.0 symbol handling, immutability, under/over-declared
bindings, five or more parameters, shifted poles, valid-empty windows, invalid ranges,
v1/v2/v3 nested round trips, v2 rejection of parametric nodes, atomic create/update/
Undo and public schema/discovery parity. Execute npm lint/unit/build and Chromium
integration in CI before merging. Native installed desktop acceptance remains a
separate gate. Neither this proposed ADR nor a green CI run implies deployment.
