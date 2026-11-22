# Hybrid catalogue coverage

The published catalogues supply canonical IDs. The extension copy supplies existing runtime evidence. An implemented row covers the registered textual construction. See the benchmark for observed performance.

| ID | Family | Status | Context | Required | Supporting | Tested by | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| loaded_language | technique | inventoried | clause | evaluative wording, evaluation exceeds literal description |  |  | Predicate and context mapping pending. |
| ad_hominem | technique | implemented | paragraph | personal_attack_as_rebuttal |  | synthetic pilot |  |
| false_dilemma | technique | implemented | paragraph | two_options_as_exhaustive |  |  | Requires evidence of another option in the passage. |
| straw_man | technique | inventoried | paragraph | opposing claim and alleged reformulation, material change followed by rebuttal |  |  | Predicate and context mapping pending. |
| appeal_to_fear | technique | inventoried | paragraph | frightening possibility, fear used to support a decision or claim |  |  | Predicate and context mapping pending. |
| bandwagon | technique | implemented | paragraph | popularity_as_reason |  | synthetic pilot |  |
| selective_presentation | technique | not_inferable | information unavailable from text |  |  |  | Relevant omitted evidence |
| out_of_context_quote | technique | not_inferable | information unavailable from text |  |  |  | Original surrounding quotation |
| whataboutism | technique | implemented | paragraph | criticism_redirected_to_other_wrong |  | frozen synthetic check |  |
| false_authority | technique | inventoried | paragraph | authority offered as evidence, lack of relevant expertise or established authority |  |  | Predicate and context mapping pending. |
| conspiracy_framing | technique | inventoried | paragraph | hidden coordination asserted, assertion grounded in insinuation or difficult-to-test claims |  |  | Predicate and context mapping pending. |
| repetition | technique | implemented | paragraph | verbatim_repeated_sentence |  | deterministic unit test | Covers exact repetition within a paragraph. The reader's response is unknown. |
| priming | technique | inventoried | article | earlier cue, later material related to the association |  |  | Predicate and context mapping pending. |
| presupposition | technique | implemented | sentence | prior_activity_assumed |  |  | Covers prior activity implied by an explicit stop construction when the grammar tagger is available. |
| false_balance | technique | not_inferable | information unavailable from text |  |  |  | Relative strength of the available evidence |
| anecdotal_evidence | technique | implemented | paragraph | story_used_as_general_proof |  | frozen synthetic check | Covers an explicitly supplied individual story. |
| slippery_slope | technique | implemented | paragraph | claim_chain_missing_links |  |  |  |
| scapegoating | technique | inventoried | paragraph | complex problem attributed broadly to a target, available other causes omitted or simplified |  |  | Predicate and context mapping pending. |
| motte_bailey | technique | inventoried | article | broad and narrower versions of a claim, shift in response to criticism |  |  | Predicate and context mapping pending. |
| gish_gallop | technique | inventoried | article | volume of claims, limited opportunity for meaningful response |  |  | Predicate and context mapping pending. |
| allegation_laundering | technique | implemented | paragraph | allegation_loses_attribution |  |  |  |
| insinuation_by_juxtaposition | technique | inventoried | paragraph | proximate details, implied connection unsupported by the details |  |  | Predicate and context mapping pending. |
| blame_reversal | technique | inventoried | paragraph | original conduct or complaint, focus shifted to the complainant's response |  |  | Predicate and context mapping pending. |
| retaliatory_discrediting | technique | inventoried | paragraph | report or complaint, source credibility attacked because of the act of reporting |  |  | Predicate and context mapping pending. |
| manufactured_consensus | technique | inventoried | article | asserted widespread agreement, weak or unrepresentative support |  |  | Predicate and context mapping pending. |
| guilt_appeal | technique | implemented | paragraph | guilt_as_leverage |  |  |  |
| obfuscation | technique | inventoried | paragraph | identifiable missing actor, action, evidence or certainty, wording obscures that information |  |  | Predicate and context mapping pending. |
| semantic_diversion | technique | inventoried | paragraph | available original claim, minor wording dispute used in place of a response |  |  | Predicate and context mapping pending. |
| moving_goalposts | technique | implemented | paragraph | changed_requirement |  |  |  |
| double_standards | technique | inventoried | article | comparable cases, inconsistent criteria or evidentiary thresholds |  |  | Predicate and context mapping pending. |
| poisoning_the_well | technique | inventoried | paragraph | prior attack on a source, later claims discounted on that basis |  |  | Predicate and context mapping pending. |
| criminalising_dissent | technique | inventoried | paragraph | dissent or criticism, criminal label unsupported by the conduct described |  |  | Predicate and context mapping pending. |
| appearance_based_attack | technique | implemented | paragraph | appearance_as_rebuttal |  |  | Covers explicit appearance insults tied to dismissal of the same person's position. |
| disgust_appeal | technique | inventoried | paragraph | revulsion-related description, description used to influence a judgement |  |  | Predicate and context mapping pending. |
| threat_framing | technique | implemented | paragraph | unfavourable_future | addressee_lacks_knowledge, unspecified_future_event, conditional_penalty | synthetic pilot |  |
| premature_closure | technique | inventoried | paragraph | issue declared settled, acknowledged or otherwise visible unresolved evidence |  |  | Predicate and context mapping pending. |
| narrative_reframing | technique | inventoried | article | selected sequence, roles or causal links, comparison context for the inferred shift |  |  | Predicate and context mapping pending. |
| quote_recontextualisation | technique | not_inferable | information unavailable from text |  |  |  | Original and subsequent context |
| public_shaming | technique | inventoried | paragraph | identifiable target, invitation to ridicule or condemn in public |  |  | Predicate and context mapping pending. |
| paternalistic_coercion_framing | technique | inventoried | paragraph | restriction or coercive demand, justification as care for the affected person |  |  | Predicate and context mapping pending. |
| incitement_to_violence | technique | inventoried | paragraph | encouragement or endorsement of violence, target identifiable by person, group or category |  |  | Predicate and context mapping pending. |
| exaggeration_minimisation | technique | inventoried | paragraph | representation of magnitude or importance, comparison evidence supporting a material discrepancy |  |  | Predicate and context mapping pending. |
| firsthand_evidence_requirement | technique | implemented | paragraph | firsthand_as_prerequisite |  |  |  |
| invoking_an_imagined_audience | technique | inventoried | paragraph | absent audience's reaction asserted or predicted, reaction used as pressure or implied opposition |  |  | Predicate and context mapping pending. |
| hasty_generalisation | technique | implemented | paragraph | limited_sample_to_group |  | frozen synthetic check |  |
| circular_reasoning | technique | implemented | paragraph | reason_restates_conclusion |  |  |  |
| appeal_to_authority | technique | implemented | paragraph | authority_as_reason |  |  | Evidence of an appeal alone cannot establish whether reliance on the authority is justified. |
| post_hoc | technique | implemented | paragraph | causal_from_sequence |  |  |  |
| red_herring | technique | inventoried | paragraph | question under discussion, irrelevant issue used to divert attention |  |  | Predicate and context mapping pending. |
| appeal_to_emotion | technique | inventoried | paragraph | emotion invoked, emotion offered as a reason to accept a claim |  |  | Predicate and context mapping pending. |
| tu_quoque | technique | implemented | paragraph | critic_inconsistency_as_rebuttal |  |  |  |
| appeal_to_ignorance | technique | implemented | paragraph | absence_as_proof |  | frozen synthetic check |  |
| false_equivalence | technique | inventoried | paragraph | assertion of equivalence, material difference relevant to the comparison |  |  | Predicate and context mapping pending. |
| cherry_picking | technique | not_inferable | information unavailable from text |  |  |  | Relevant omitted evidence |
| preference_as_moral_obligation | technique | inventoried | paragraph | personal preference, unsupported obligation and condemnation of noncompliance |  |  | Predicate and context mapping pending. |
| too_good_to_be_true | technique | implemented | paragraph | disproportionate_reward_offer |  |  |  |
| deliberate_errors | technique | not_inferable | information unavailable from text |  |  |  | Intent cannot be established from a spelling observation |
| moral_authority_instead_of_argument | technique | inventoried | paragraph | moral principle, principle used to delegitimise questioning rather than address a claim |  |  | Predicate and context mapping pending. |
| provoking_backlash | technique | inventoried | paragraph | defensible principle coupled to disproportionate pressure, actual reaction or intent requires other evidence |  |  | Predicate and context mapping pending. |
| turning_disagreement_into_freedom_conflict | technique | implemented | paragraph | freedom_to_speak_redirect |  |  |  |
| manufactured_inevitability | technique | implemented | paragraph | tautology_as_necessity |  |  | Covers explicit claims of necessity based on an identical label or mere existence. |
| attack_conflation | technique | implemented | paragraph | rebuttal_as_wider_attack |  |  |  |
| restoring_agency | positive | implemented | paragraph | free_choice |  |  | Covers freely offered choices. |
| welcoming_disagreement | positive | implemented | paragraph | disagreement_welcome |  | frozen synthetic check |  |
| separating_observation_from_interpretation | positive | implemented | paragraph | distinguishes_inference |  |  |  |
| acknowledging_uncertainty | positive | implemented | paragraph | acknowledged_uncertainty |  | synthetic pilot |  |
| respecting_boundaries | positive | implemented | paragraph | plain_boundary_respect |  | frozen synthetic check | Covers explicit acceptance of a stated boundary. |
| proportionate_response | positive | inventoried | paragraph | stated impact, response matches the described scale |  |  | Predicate and context mapping pending. |
| encouraging_independent_thought | positive | implemented | paragraph | independent_check |  | synthetic pilot | Covers invitations to verify evidence. |
| validating_emotional_experience | positive | implemented | paragraph | validating_feeling |  |  |  |
| transparent_reasoning | positive | implemented | paragraph | reason_supports | reason_given | synthetic pilot | Covers a reason that supports a stated conclusion. |
| supporting_informed_choice | positive | inventoried | paragraph | meaningful alternatives, material trade-offs presented |  |  | Predicate and context mapping pending. |
| taking_responsibility | positive | implemented | paragraph | ownership_of_harm |  |  |  |
| respecting_attention | positive | implemented | paragraph | offered_attention_exit |  |  | Covers an explicit option to disengage. |
| supported_conclusion | inconsistency | implemented | paragraph | reason_supports |  | synthetic pilot |  |
| choice_with_coercion | concealed | implemented | paragraph | choice_with_linked_penalty | choice, conditional_penalty | frozen synthetic check | Covers a penalty tied to declining the stated choice. |
| respect_with_penalty | concealed | implemented | paragraph | disagreement_with_penalty |  |  |  |
| empathy_with_guilt | concealed | implemented | paragraph | empathy_with_linked_guilt |  |  |  |
| independence_with_control | concealed | implemented | paragraph | independence_with_demand |  |  |  |

## Extension copy reconciliation

- too_good_to_be_true is absent from the extension copy.
- moral_authority_instead_of_argument is absent from the extension copy.
- provoking_backlash is absent from the extension copy.
- turning_disagreement_into_freedom_conflict is absent from the extension copy.

The questionnaire reads the published techniques catalogue. Existing positive rules and concealed component IDs are recorded in the JSON matrix.

## Runtime-only identifiers

- orthographic_attention_hook · preprocessing_diagnostic · extension/src/text-preprocessing.mjs
- nonstandard_vocabulary · preprocessing_diagnostic · extension/src/matcher-worker.js
