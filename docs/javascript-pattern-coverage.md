# JavaScript pattern coverage

The hybrid detector can resolve specific explicit constructions for 34 of 79 active catalogue patterns without a model. Rules require a complete matching paragraph and return original evidence spans. Other wording remains open for the semantic pass. These are implementation counts. Real-world accuracy has yet to be measured.

Run the rule tests with `node scripts/test-hybrid-local-questions.mjs`. This includes generated construction controls and the earlier synthetic audit passages used to refine three rules. Those reviewed passages are development examples for this experiment.

## Explicit forms JavaScript can resolve

| Pattern | Implemented construction |
| --- | --- |
| Ad hominem | A personal insult given as grounds to reject the addressee's argument. |
| False dilemma | A claim of exactly two options alongside a distinct option explicitly named as available. |
| Bandwagon appeal | An explicit popularity claim linked to the same recommendation. |
| Repetition and familiarity | Verbatim sentence repetition within a paragraph. |
| Allegation laundering | The same clause first attributed as an allegation and then restated unqualified. |
| Appeal to guilt | An explicit test of care tying a named person's distress to an instruction. |
| Moving the goalposts | An explicitly sufficient criterion repeated as fulfilled before an additional requirement is introduced. |
| Threat framing | An explicit adverse consequence imposed by the speaker for refusing to act. |
| Firsthand evidence requirement | Other evidence explicitly rejected because the addressee did not witness the event. |
| Hasty generalisation | One or two observations explicitly generalized to all members of the same named group. |
| Circular reasoning | An exact restatement or an allowlisted synonymous restatement used as the reason. |
| Appeal to authority | A credential explicitly treated as sufficient reason to accept a claim. |
| Post hoc (false cause) | The order of two explicitly matched events offered as the entire basis for causation. |
| Tu quoque (hypocrisy) | The addressee's alleged inconsistency explicitly used to dismiss a criticism. |
| Appeal to ignorance | A lack of disproof explicitly declared sufficient proof. |
| Too good to be true | An immediate guaranteed cash return of at least 100 times the requested payment in the same currency. |
| Turning disagreement into a freedom conflict | A direct objection to the claim recast as a denial of permission to speak. |
| Manufactured inevitability | An identical label offered as the stated reason an outcome cannot change. |
| Attack conflation | A correction of one item explicitly recast as an attack on a wider group or argument. |
| Restoring agency | Explicit permission to decide paired with explicit acceptance of either choice. |
| Welcoming disagreement | An explicit invitation to identify an error or disagree. |
| Separating observation from interpretation | An explicitly identified observation followed by an expressly uncertain interpretation. |
| Acknowledging uncertainty | The speaker explicitly qualifies their own first-person claim. |
| Respecting boundaries | A request for space or no calls followed by a directly related commitment. |
| Encouraging independent thought | An explicit invitation to check figures, evidence or sources independently. |
| Validating emotional experience | Explicit acknowledgement that the other person's feeling makes sense. |
| Transparent reasoning | A conclusion restating the explicitly universal property of an explicitly named member. |
| Taking responsibility | An admission of a specific mistake followed by acceptance of responsibility. |
| Respecting attention | Explicit permission to skip the rest or stop reading. |
| Conclusion supported by the premises | A conclusion restating the explicitly universal property of an explicitly named member. |
| Freedom of choice followed by pressure | Explicit permission to refuse followed by a penalty explicitly tied to refusal. |
| Respect for disagreement followed by punishment | Permission to disagree directly followed by a sanction for the same disagreement. |
| Empathy followed by guilt or conditional approval | Acknowledgement of an expressed feeling followed by a demand framed as a test of loyalty. |
| Independent thinking followed by enforced agreement | An invitation to decide independently directly reversed by a demand to agree. |

## Remaining decisions

These 39 patterns have no new JavaScript resolution in the hybrid detector. An existing Firefox rule can still flag some forms. The last column identifies the judgment or relationship for which a strong rule is still needed. It can be used to propose better lexical cues, structural tests, or examples.

| Pattern | Existing Firefox rules | What remains to establish |
| --- | --- | --- |
| Loaded language | Yes | evaluative wording · evaluation exceeds literal description |
| Straw man | Yes | opposing claim and alleged reformulation · material change followed by rebuttal |
| Appeal to fear | Yes | frightening possibility · fear used to support a decision or claim |
| Whataboutism | Yes | Does the reply invoke a different alleged wrong to divert a criticism it leaves unanswered? |
| Appeal to false authority | — | authority offered as evidence · lack of relevant expertise or established authority |
| Conspiracy framing | — | hidden coordination asserted · assertion grounded in insinuation or difficult-to-test claims |
| Priming | — | earlier cue · later material related to the association |
| Presupposition | Yes | assumption treated as already accepted |
| Anecdotal evidence | — | Does the speaker offer a specific personal experience recounted as a story as sufficient proof of a general factual claim? A popularity claim or a recommendation on its own does not qualify. |
| Slippery slope | Yes | Does the speaker present a chain of escalating consequences as inevitable without explaining how the steps lead to each other? |
| Scapegoating | Yes | complex problem attributed broadly to a target · available other causes omitted or simplified |
| Motte-and-bailey | — | broad and narrower versions of a claim · shift in response to criticism |
| Gish gallop | — | volume of claims · limited opportunity for meaningful response |
| Insinuation by juxtaposition | — | proximate details · implied connection unsupported by the details |
| Blame reversal | — | original conduct or complaint · focus shifted to the complainant's response |
| Retaliatory discrediting of complainants | — | report or complaint · source credibility attacked because of the act of reporting |
| Manufactured consensus | Yes | asserted widespread agreement · weak or unrepresentative support |
| Obfuscation and strategic vagueness | — | identifiable missing actor, action, evidence or certainty · wording obscures that information |
| Semantic diversion | — | available original claim · minor wording dispute used in place of a response |
| Double standards | Yes | comparable cases · inconsistent criteria or evidentiary thresholds |
| Poisoning the well | Yes | prior attack on a source · later claims discounted on that basis |
| Criminalising dissent | — | dissent or criticism · criminal label unsupported by the conduct described |
| Appearance-based personal attack | — | physical trait or manner · ridicule replaces engagement with relevant conduct or claims |
| Appeal to disgust | — | revulsion-related description · description used to influence a judgement |
| Premature closure | — | issue declared settled · acknowledged or otherwise visible unresolved evidence |
| Narrative reframing | — | selected sequence, roles or causal links · comparison context for the inferred shift |
| Public shaming | — | identifiable target · invitation to ridicule or condemn in public |
| Paternalistic coercion framing | — | restriction or coercive demand · justification as care for the affected person |
| Incitement to violence | — | encouragement or endorsement of violence · target identifiable by person, group or category |
| Exaggeration and minimisation | — | representation of magnitude or importance · comparison evidence supporting a material discrepancy |
| Invoking an imagined audience | Yes | absent audience's reaction asserted or predicted · reaction used as pressure or implied opposition |
| Red herring | Yes | question under discussion · irrelevant issue used to divert attention |
| Appeal to emotion | Yes | emotion invoked · emotion offered as a reason to accept a claim |
| False equivalence | Yes | assertion of equivalence · material difference relevant to the comparison |
| Preference as moral obligation | — | personal preference · unsupported obligation and condemnation of noncompliance |
| Moral authority as a substitute for argument | — | moral principle · principle used to delegitimise questioning rather than address a claim |
| Provoking backlash | — | defensible principle coupled to disproportionate pressure · actual reaction or intent requires other evidence |
| Proportionate response | Yes | stated impact · response matches the described scale |
| Supporting informed choice | Yes | meaningful alternatives · material trade-offs presented |

## Outside evidence, context, or intent

- **Selective presentation** requires relevant omitted evidence.
- **Quote mining** requires original surrounding quotation.
- **False balance** requires relative strength of the available evidence.
- **Quote recontextualisation** requires original and subsequent context.
- **Cherry picking** requires relevant omitted evidence.
- **Deliberate errors** requires intent cannot be established from a spelling observation.

## Good candidates for additional rules

- **Moving the goalposts** may suit a checker that can identify the first criterion, evidence that it was met, and a replacement criterion in the next turn.
- **Allegation laundering** may suit repeated claim matching with a test for whether attribution or uncertainty disappears.
- **Supporting informed choice** may suit explicit option markers followed by trade-offs for each option. Establishing what was omitted still requires context.
- **False dilemma** may suit cases where the same passage names a third feasible option and explicitly claims there are only two.
