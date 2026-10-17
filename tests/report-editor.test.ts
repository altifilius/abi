import { describe, expect, it } from 'bun:test';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { canonicalApplicationData } from '../components/applicationData';
import { normalizeEditorNode } from '../components/RichReportEditor';
import type { RichDocument } from '../services/reports';

const formattedDocument: RichDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'First', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'hardBreak', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'text', text: 'Second', marks: [{ type: 'bold' }, { type: 'italic' }] },
      ],
    },
  ],
};

describe('Rich report editing boundaries', () => {
  it('preserves bold and italic text while removing inherited marks from soft breaks', () => {
    const editor = new Editor({
      element: null,
      extensions: [StarterKit],
      content: formattedDocument,
    });
    try {
      const normalized = normalizeEditorNode(editor.getJSON());
      const children = normalized.content?.[0].content;
      expect(children?.[0]).toEqual(formattedDocument.content?.[0].content?.[0]);
      expect(children?.[1]).toEqual({ type: 'hardBreak' });
      expect(children?.[2]).toEqual(formattedDocument.content?.[0].content?.[2]);
      expect(formattedDocument.content?.[0].content?.[1].marks).toHaveLength(2);
    } finally {
      editor.destroy();
    }
  });

  it('compares saved and ProseMirror property order as the same document', () => {
    const saved: RichDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Saved', marks: [{ type: 'bold' }] }],
        },
      ],
    };
    const editor = new Editor({ element: null, extensions: [StarterKit], content: saved });
    try {
      expect(canonicalApplicationData(normalizeEditorNode(editor.getJSON()))).toBe(
        canonicalApplicationData(normalizeEditorNode(saved)),
      );
      const changed = normalizeEditorNode(editor.getJSON());
      if (changed.content?.[0].content?.[0]) changed.content[0].content[0].text = 'Changed';
      expect(canonicalApplicationData(changed)).not.toBe(canonicalApplicationData(saved));
    } finally {
      editor.destroy();
    }
  });
});
