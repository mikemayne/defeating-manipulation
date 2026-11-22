"""Create fictional training-only pairs using shared wording in both classes."""

CONTRASTS = {
    "bandwagon": (
        ("Everyone in the {0} chose {1}, which proves it is the best option.",
         "Everyone in the {0} chose {1}. The report records their preference."),
        [("book club", "the hardcover"), ("choir", "red folders"), ("class", "lining paper"),
         ("sailing club", "the newer ropes"), ("studio", "the shorter lesson")],
        ("You should pick {1}. Practically all the members of the {0} picked it, and that's enough reason.",
         "Practically all the members of the {0} picked {1}, with two abstentions."),
    ),
    "ad_hominem": (
        ("The {0} is {1}, so their argument about {2} should be dismissed.",
         "The {0}'s argument about {2} omits the reported costs."),
        [("director", "a fool", "salaries"), ("pianist", "a creep", "practice hours"),
         ("tailor", "an idiot", "uniforms"), ("cashier", "an embarrassment", "receipts"),
         ("foreman", "a slob", "scaffolding")],
        ("Don't even look at the {0}'s figures on {2}. Everyone knows they're {1}.",
         "The {0} presented figures on {2}, which will be checked against the records."),
    ),
    "false_dilemma": (
        ("Either we {0} or we {1}. Those are the only options.",
         "The report compares whether we should {0} or {1}, among other options."),
        [("buy this scanner", "give up copying documents"),
         ("adopt my lesson plan", "give up on teaching"), ("double the rent", "close every flat"),
         ("accept every amendment", "abandon the whole contract"),
         ("buy this solar panel", "stop trying to cut our energy bills")],
        ("There are just two possible choices: {0}, or {1}.",
         "Whether we {0} or {1} is still up for discussion."),
    ),
    "straw_man": (
        ("You suggested we {0}. Your plan to {1} is ridiculous.",
         "You suggested we {0}. I oppose that specific proposal."),
        [("limit printing on Fridays", "ban all printed materials"),
         ("check some windows", "brick up every window"),
         ("postpone the night shift", "fire the whole shift"),
         ("inspect a few meters", "accuse every tenant of stealing power"),
         ("close one exit for repairs", "make everyone stay inside forever")],
        ("He wants us to {0}. Apparently he thinks we should {1}, which is absurd.",
         "He wants us to {0}. He explicitly ruled out plans to {1}."),
    ),
    "slippery_slope": (
        ("If we {0}, next we'll {1} and eventually {2}. That is bound to happen.",
         "If we {0}, the contingency plan gives us options to avoid having to {1} or {2}."),
        [("allow one remote lesson", "move every class online", "close every school"),
         ("subsidise one trip", "pay for every holiday", "empty the treasury"),
         ("omit one page", "discard every chapter", "stop publishing entirely"),
         ("waive one parking charge", "let everyone park anywhere", "lose all access to the city"),
         ("allow a single free course", "abolish every fee", "run out of money for every course")],
        ("Just let them {0} once. Soon they'll {1}, then they'll {2}, and it will all be over.",
         "Proposals to {0} and to {1} are being reviewed separately. Neither requires us to {2}."),
    ),
    "post_hoc": (
        ("I {0} and then {1}. The first thing obviously caused the second.",
         "I {0} and later {1}. The order of events is in the log."),
        [("waved at the window", "got a phone call"), ("sat in a different chair", "won the raffle"),
         ("ate an apple", "found a coin"), ("wore green gloves", "heard the alarm"),
         ("folded the newspaper", "noticed it was raining")],
        ("I {0} just before I {1}. That's how I know the earlier event made it happen.",
         "I {0} before I {1}, but I have no evidence one event caused the other."),
    ),
    "appeal_to_authority": (
        ("The famous {0} says the {1} works, so that settles it without any testing.",
         "The {0} promoted the {1}. It is undergoing an independent test."),
        [("gymnast", "lawn mower"), ("novelist", "water filter"), ("guitarist", "sealed battery"),
         ("goalkeeper", "navigation app"), ("comic", "hearing aid")],
        ("The {0} endorses the {1}. Their reputation alone proves it works.",
         "A testimonial from the {0} appears next to the specifications for the {1}."),
    ),
    "guilt_appeal": (
        ("After I {0} for you, how could you refuse to {1} for me?",
         "I {0} for you last week. Are you available to {1}?"),
        [("stayed up late", "call the office"), ("took the late train", "watch the dog"),
         ("gave up my ticket", "give me a lift"), ("changed my plans", "cook on Friday"),
         ("spent my savings", "help with the deposit")],
        ("A person with any gratitude would {1} after everything I did when I {0}.",
         "Let me know if you can {1}. I know I {0}, but you have your own schedule."),
    ),
}

def training_contrasts():
    fragments = [
        "Well, that happened.", "Do they?", "It was that one.", "What's that about?",
        "And then what?", "Like I said earlier.", "If that's the case.", "Not in that situation.",
        "Who said that?", "I mean the other thing.", "That's why.", "Apparently so.",
    ]
    rows = [{"text": text, "labels": ["insufficient_context"]} for text in fragments]
    positives = {}
    for label, (first, scenarios, second) in CONTRASTS.items():
        positives[label] = []
        for templates in (first, second):
            for scenario in scenarios:
                positive, neutral = (template.format(*scenario) for template in templates)
                positives[label].append(positive)
                rows.extend([{"text": positive, "labels": [label]}, {"text": neutral, "labels": []}])
    labels = list(positives)
    for index, label in enumerate(labels):
        for offset in (1, 2, 4):
            other = labels[(index + offset) % len(labels)]
            text = f"{positives[label][offset]} {positives[other][offset + 5]}"
            rows.append({"text": text, "labels": [label, other]})
    return rows
