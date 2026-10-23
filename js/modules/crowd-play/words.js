// Words for the aquarium. Labels are lazy names for the others (never real coins). The others talk like
// they have no brain; Turri talks like it has one and knows it. No exclamation marks, no em dashes.

export const LABELS = [
  "another dog", "fork of a fork", "AI agent #4012", "frog, again", "dev is asleep", "ticker is a typo",
  "community takeover", "logo first, plan later", "vibes only", "graduated, then forgot", "moon, allegedly",
  "a cat in a costume", "renamed twice", "whitepaper pending", "influencer's cousin", "bonding curve tourist",
  "it's a meme, ser", "AI agent #4013", "copy of a copy", "trust me bro",
];

// What the x-ray finds where a brain should be
export const INSIDE = ["empty", "empty", "empty", "empty", "just water", "a logo", "vibes", "echo", "nothing", "empty"];

// Clicked brainless jellies
export const DUMB = [
  "wen", "gm", "Is this the dip.", "I go where the chart goes.", "What's a hook.", "Dev said trust him.",
  "Floating. Still floating.", "Number go up, right.", "I have a ticker. That's my whole personality.", "Bloop.",
  "Was I supposed to have a plan.", "My roadmap is a picture of a road.", "Who's driving.",
  "I drift. It's a strategy.", "They said there'd be a community.", "Brain? I have a logo.",
  "Same as yesterday. Same as tomorrow.", "Is the dev back yet.", "I'm early. I think.", "Do we get tentacles that do things too.",
];

// Clicked retired husks (Turri's old bodies)
export const HUSK = [
  "I was somebody once. Something with a v.", "Something used to live up here.", "I had opinions. They left.",
  "Did I use to do things.",
];

// Clicked Turri. Functions get live numbers, never invented ones.
export const SHARP = [
  (s) => `Careful. That's v${s.version} you're poking.`,
  () => "Yes, I'm the one with the brain. Try to act surprised.",
  () => "I swim with them so they feel included.",
  () => "Poke them. They won't remember. I will.",
  () => "I'm not lost. This is research.",
  (s) => (s.age != null ? `This brain is ${s.age} old and already the smartest thing in here.` : "New brain. Already the smartest thing in here."),
  (s) => `Every ${s.minutes} minutes I get a new brain. They get a new ticker.`,
  () => "Glass bell, real brain. Look all you want.",
  () => "I used to drift like them. Then I wrote some code.",
];

// "What I thought about you" when Turri hasn't looked at that one yet
export const UNSEEN = [
  "Nothing yet. You haven't done anything.",
  "I haven't thought about you. Don't take it personally.",
  "You drifted past twice. That's all I've got.",
  "Still deciding if you're a dog or a frog.",
];

// Turri on the glass taps
export const GLASS = [
  "Please don't tap the glass.",
  "The glass. We talked about the glass.",
  "They can't hear you. I can.",
];
