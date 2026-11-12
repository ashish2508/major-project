/**
 * boilerplate.test.ts
 *
 * Tests for maskBoilerplate() and isSuppressedPair() from boilerplate.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  maskBoilerplate,
  isSuppressedPair,
  getSuppressedList,
} from '../src/lib/detection/boilerplate';

// ---------------------------------------------------------------------------
// maskBoilerplate tests
// ---------------------------------------------------------------------------

describe('maskBoilerplate', () => {
  it('1. masks the CC license phrase with equal-length spaces', () => {
    const input = 'This work is licensed under Creative Commons Attribution 4.0';
    const { maskedText, suppressedItems } = maskBoilerplate(input);

    // The original and masked text must be the same length (offset-preserving)
    expect(maskedText.length).toBe(input.length);

    // The CC phrase 'Creative Commons Attribution 4.0' must be masked
    // (whole line is replaced with spaces)
    const ccPhrase = 'Creative Commons Attribution 4.0';
    const ccIndex = input.indexOf(ccPhrase);
    expect(ccIndex).toBeGreaterThanOrEqual(0);
    // The masked text at the cc phrase position should be spaces
    const maskedAtPhrase = maskedText.slice(ccIndex, ccIndex + ccPhrase.length);
    expect(maskedAtPhrase.trim()).toBe('');

    // At least one suppressed item should be recorded
    expect(suppressedItems.length).toBeGreaterThan(0);
    const ccItem = suppressedItems.find((s) => s.name === 'creative_commons');
    expect(ccItem).toBeDefined();
  });

  it('2. does NOT suppress genuine content (Methods paragraph)', () => {
    const input = 'Methods\nWe conducted a randomized trial.';
    const { maskedText, suppressedItems } = maskBoilerplate(input);

    // No back-matter heading "Methods" is in the back-matter list (it is body content)
    // The sentence "We conducted a randomized trial." should NOT be masked
    const sentence = 'We conducted a randomized trial.';
    const idx = input.indexOf(sentence);
    expect(idx).toBeGreaterThanOrEqual(0);

    // The sentence should be intact in maskedText
    expect(maskedText.slice(idx, idx + sentence.length)).toBe(sentence);

    // No suppressed items for this content
    // (there might be zero items, or items for affiliation_line if "Methods" is detected,
    //  but the actual sentence should NOT be suppressed)
    const sentenceIsMasked = maskedText
      .slice(idx, idx + sentence.length)
      .split('')
      .every((c) => c === ' ');
    expect(sentenceIsMasked).toBe(false);
  });

  it('3. masks front matter before Abstract heading', () => {
    const title = 'Title Page\nAuthor Name\nAffiliation\n';
    const abstractSection = 'Abstract\nThis study investigates something important.';
    const input = title + abstractSection;

    const { maskedText, suppressedItems } = maskBoilerplate(input);

    // The front matter (title + author) should be masked
    const frontMatterLength = title.length;
    const maskedFront = maskedText.slice(0, frontMatterLength);
    // All non-whitespace chars in the front matter should now be spaces
    expect(maskedFront.replace(/ /g, '').replace(/\n/g, '').length).toBe(0);

    // The Abstract heading and content should NOT be masked by front-matter masking
    // (they start at frontMatterLength)
    const abstractStart = maskedText.indexOf('Abstract');
    expect(abstractStart).toBeGreaterThanOrEqual(0);

    // A front_matter suppressed item should exist
    const fmItem = suppressedItems.find((s) => s.name === 'front_matter');
    expect(fmItem).toBeDefined();
    expect(fmItem!.startOffset).toBe(0);
    expect(fmItem!.endOffset).toBe(frontMatterLength);
  });

  it('4. masks the Acknowledgements back-matter section', () => {
    const body = 'Introduction\nThis is the introduction.\n\n';
    const ack = 'Acknowledgements\nWe thank Dr. Smith for the support.\n';
    const input = body + ack;

    const { maskedText, suppressedItems } = maskBoilerplate(input);

    // maskedText should have same length
    expect(maskedText.length).toBe(input.length);

    // The acknowledgements section should be masked
    const ackStart = input.indexOf('Acknowledgements');
    expect(ackStart).toBeGreaterThanOrEqual(0);
    const maskedAck = maskedText.slice(ackStart);
    // All non-newline characters in acknowledgements should be spaces
    const nonSpaceChars = maskedAck.replace(/[ \n\r]/g, '');
    expect(nonSpaceChars.length).toBe(0);

    // The body content should NOT be masked
    const bodyContent = 'This is the introduction.';
    const bodyIdx = input.indexOf(bodyContent);
    expect(maskedText.slice(bodyIdx, bodyIdx + bodyContent.length)).toBe(bodyContent);

    // A back_matter_acknowledgements suppressed item should exist
    const ackItem = suppressedItems.find((s) => s.name.startsWith('back_matter_'));
    expect(ackItem).toBeDefined();
  });

  it('5. suppressed items appear in suppressedItems list', () => {
    const input =
      'All rights reserved. Copyright © 2020 The Authors. This is some extra text to fill the line.';
    const { suppressedItems } = maskBoilerplate(input);

    expect(suppressedItems.length).toBeGreaterThan(0);
    // getSuppressedList should return a non-empty string
    const list = getSuppressedList(suppressedItems);
    expect(list).not.toBe('No items suppressed.');
    expect(list).toContain('[1]');
  });
});

// ---------------------------------------------------------------------------
// isSuppressedPair tests
// ---------------------------------------------------------------------------

describe('isSuppressedPair', () => {
  it('6. returns true when BOTH texts match a boilerplate pattern (CC license)', () => {
    const text = 'Creative Commons Attribution';
    expect(isSuppressedPair(text, text)).toBe(true);
  });

  it('7. returns false when neither text matches a boilerplate pattern', () => {
    const text = 'We conducted a randomized controlled trial.';
    expect(isSuppressedPair(text, text)).toBe(false);
  });

  it('returns false when only one text matches a boilerplate pattern', () => {
    const boilerplate = 'Creative Commons Attribution BY 4.0';
    const genuine = 'We conducted a randomized controlled trial with 120 participants.';
    expect(isSuppressedPair(boilerplate, genuine)).toBe(false);
    expect(isSuppressedPair(genuine, boilerplate)).toBe(false);
  });

  it('returns true for copyright lines on both sides', () => {
    const text = 'Copyright © 2020 The Authors. All rights reserved.';
    expect(isSuppressedPair(text, text)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSuppressedList tests
// ---------------------------------------------------------------------------

describe('getSuppressedList', () => {
  it('returns "No items suppressed." for empty array', () => {
    expect(getSuppressedList([])).toBe('No items suppressed.');
  });

  it('formats items with index, name, offset, reason, and text', () => {
    const items = [
      {
        name: 'creative_commons',
        matchedText: 'Creative Commons Attribution 4.0',
        startOffset: 10,
        endOffset: 42,
        reason: 'CC license boilerplate',
      },
    ];
    const result = getSuppressedList(items);
    expect(result).toContain('[1]');
    expect(result).toContain('creative_commons');
    expect(result).toContain('10');
    expect(result).toContain('42');
    expect(result).toContain('CC license boilerplate');
  });
});
