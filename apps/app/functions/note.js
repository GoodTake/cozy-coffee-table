// The barista's note of the day, written by the platform's AI once a day.
'use strict';

const { invokeAI } = require('./platform');
const { z } = require('./vendor.cjs');
const { SHOP_NAME, menu, todaysDate, todaysSpecial } = require('./cafe');

const BARISTAS = ['Maya', 'Theo', 'Priya', 'Sam'];

const noteSchema = {
  type: 'object',
  properties: {
    note: { type: 'string', description: 'One or two warm, friendly sentences, at most 30 words.' },
    barista: { type: 'string', enum: BARISTAS },
  },
  required: ['note', 'barista'],
};

const noteShape = z.object({
  note: z.string().trim().min(1).max(300),
  barista: z.enum(BARISTAS),
});

// One note per day, shared by every visitor. A failed call is not cached.
let cached = null; // { date, promise }

async function writeNote(date) {
  const special = todaysSpecial();
  const items = [...menu.drinks, ...menu.pastries].map((item) => item.name).join(', ');
  const result = await invokeAI({
    system: `You write the chalkboard note for ${SHOP_NAME}, a cosy neighbourhood café in Bristol, England. Use British English. Plain text only, no emoji, no hashtags.`,
    prompt: `Write today's barista's note for ${date}. Pick one of our baristas (${BARISTAS.join(', ')}) to sign it. `
      + `Mention today's special, the ${special.name}, or one item from the menu: ${items}. Keep it warm, specific and under 30 words.`,
    schema: noteSchema,
  });
  return noteShape.parse(result);
}

function noteOfTheDay() {
  const date = todaysDate();
  if (!cached || cached.date !== date) {
    const promise = writeNote(date);
    cached = { date, promise };
    promise.catch(() => {
      if (cached && cached.promise === promise) cached = null;
    });
  }
  return cached.promise;
}

module.exports = { noteOfTheDay };
