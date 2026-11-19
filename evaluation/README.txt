# Evaluation fixtures

Use the fictional cases in fixtures.json to test whether a model recognises relevant textual patterns without over-labelling ordinary writing. Include positive, negative and ambiguous examples. Measure precision and false positives, and test that every quotation is exact.

Evaluate whether the model:
- identifies the relevant technique;
- explains the observable feature accurately;
- describes a plausible effect on the reader;
- stays concise and does not speculate about motives;
- avoids labelling ordinary writing without a clear textual basis.

The user-facing sequence is **Recognise. Report. Disengage.** The model's job is recognition. Reporting decisions remain with the reader, and the interface should make disengagement the natural next step.

Update expected candidates only after human review. Do not use private user material or full copyrighted articles in the public evaluation set.
