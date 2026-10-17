import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, ChevronDown, Italic, List, ListOrdered, Redo2, Table2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { RichDocument, RichNode } from '../services/reports';
import { canonicalApplicationData } from './applicationData';

export interface RichReportEditorProps {
  content: RichDocument;
  onChange?: (content: RichDocument) => void;
  readOnly?: boolean;
  showToolbar?: boolean;
  onFocus?: () => void;
  label: string;
}

export function normalizeEditorNode(node: RichNode): RichNode {
  const result: RichNode = { type: node.type };
  if (node.text !== undefined) result.text = node.text;
  if (node.attrs)
    result.attrs = Object.fromEntries(
      Object.entries(node.attrs).filter(([, value]) => value !== null && value !== undefined),
    );
  if (node.type === 'text' && node.marks)
    result.marks = node.marks.map((mark) => ({
      ...mark,
      ...(mark.attrs
        ? {
            attrs: Object.fromEntries(
              Object.entries(mark.attrs).filter(
                ([, value]) => value !== null && value !== undefined,
              ),
            ),
          }
        : {}),
    }));
  if (node.content) result.content = node.content.map(normalizeEditorNode);
  return result;
}

export default function RichReportEditor({
  content,
  onChange,
  readOnly = false,
  showToolbar = true,
  onFocus,
  label,
}: RichReportEditorProps) {
  const { text } = useI18n();
  const [contentError, setContentError] = useState('');
  const change = useRef(onChange);
  change.current = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: false, protocols: ['https', 'http', 'mailto'] },
      }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({
        placeholder: text('Bu bölüme yazmaya başlayın…', 'Start writing this section…'),
      }),
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,
    enableContentCheck: true,
    editorProps: { attributes: { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true' } },
    onContentError: ({ error }) => {
      setContentError(error.message);
    },
    onUpdate: ({ editor: instance }) => {
      change.current?.(normalizeEditorNode(instance.getJSON() as RichDocument) as RichDocument);
    },
  });
  const formatting = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance?.isActive('bold') || false,
      italic: instance?.isActive('italic') || false,
      bulletList: instance?.isActive('bulletList') || false,
      orderedList: instance?.isActive('orderedList') || false,
      table: instance?.isActive('table') || false,
      heading: instance?.isActive('heading')
        ? String(instance.getAttributes('heading').level)
        : 'paragraph',
    }),
  });
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly && !contentError, false);
  }, [editor, readOnly, contentError]);
  useEffect(() => {
    if (
      !editor ||
      canonicalApplicationData(normalizeEditorNode(editor.getJSON() as RichDocument)) ===
        canonicalApplicationData(normalizeEditorNode(content))
    )
      return;
    try {
      editor.commands.setContent(content, { emitUpdate: false, errorOnInvalidContent: true });
      setContentError('');
    } catch (failure) {
      setContentError(
        failure instanceof Error
          ? failure.message
          : text('Belge açılamadı.', 'The document could not be opened.'),
      );
    }
  }, [content, editor, text]);
  return (
    <div className="report-editor" data-readonly={readOnly || undefined} onFocusCapture={onFocus}>
      {!readOnly && showToolbar && editor && !contentError && (
        <div
          className="report-editor-toolbar"
          role="toolbar"
          aria-label={text('Metin biçimlendirme', 'Text formatting')}
        >
          <select
            aria-label={text('Paragraf biçimi', 'Paragraph style')}
            title={text('Paragraf biçimi', 'Paragraph style')}
            value={formatting?.heading || 'paragraph'}
            onChange={(event) => {
              if (event.target.value === 'paragraph') editor.chain().focus().setParagraph().run();
              else
                editor
                  .chain()
                  .focus()
                  .setHeading({ level: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6 })
                  .run();
            }}
          >
            <option value="paragraph">{text('Normal metin', 'Normal text')}</option>
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <option key={level} value={level}>
                {text('Başlık', 'Heading')} {level}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-button format-button"
            aria-label={text('Kalın', 'Bold')}
            title={text('Kalın', 'Bold')}
            aria-pressed={formatting?.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button format-button"
            aria-label={text('İtalik', 'Italic')}
            title={text('İtalik', 'Italic')}
            aria-pressed={formatting?.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button format-button"
            aria-label={text('Madde listesi', 'Bullet list')}
            title={text('Madde listesi', 'Bullet list')}
            aria-pressed={formatting?.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button format-button"
            aria-label={text('Numaralı liste', 'Numbered list')}
            title={text('Numaralı liste', 'Numbered list')}
            aria-pressed={formatting?.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button format-button"
            aria-label={text('Geri al', 'Undo')}
            title={text('Geri al', 'Undo')}
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button format-button"
            aria-label={text('Yinele', 'Redo')}
            title={text('Yinele', 'Redo')}
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 size={16} aria-hidden="true" />
          </button>
          {!formatting?.table && (
            <button
              type="button"
              className="icon-button format-button"
              aria-label={text('Tablo ekle', 'Insert table')}
              title={text('Tablo ekle', 'Insert table')}
              disabled={formatting?.bulletList || formatting?.orderedList}
              onClick={() =>
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
            >
              <Table2 size={16} aria-hidden="true" />
            </button>
          )}
          {formatting?.table && (
            <details className="table-controls compact-menu">
              <summary
                aria-label={text('Tablo işlemleri', 'Table tools')}
                title={text('Tablo işlemleri', 'Table tools')}
              >
                <Table2 size={16} aria-hidden="true" />
                <ChevronDown size={12} aria-hidden="true" />
              </summary>
              <div className="compact-menu-panel">
                <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>
                  {text('Satır ekle', 'Add row')}
                </button>
                <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                  {text('Sütun ekle', 'Add column')}
                </button>
                <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>
                  {text('Satırı sil', 'Delete row')}
                </button>
                <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>
                  {text('Sütunu sil', 'Delete column')}
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                >
                  {text('Başlık satırı', 'Header row')}
                </button>
                <button
                  type="button"
                  disabled={!editor.can().mergeCells()}
                  onClick={() => editor.chain().focus().mergeCells().run()}
                >
                  {text('Hücreleri birleştir', 'Merge cells')}
                </button>
                <button
                  type="button"
                  disabled={!editor.can().splitCell()}
                  onClick={() => editor.chain().focus().splitCell().run()}
                >
                  {text('Hücreyi böl', 'Split cell')}
                </button>
                <button type="button" onClick={() => editor.chain().focus().deleteTable().run()}>
                  {text('Tabloyu sil', 'Delete table')}
                </button>
              </div>
            </details>
          )}
        </div>
      )}
      {contentError && (
        <p role="alert" className="error">
          {text(
            'Belge biçimi desteklenmiyor. Kayıtlı içerik korunmuştur:',
            'The document format is unsupported. Saved content has been preserved:',
          )}{' '}
          {contentError}
        </p>
      )}
      <EditorContent className="report-editor-surface" editor={editor} />
    </div>
  );
}
