import React, { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { PageTitle } from '../shared-ui';
import { createIdea, syncStorage } from '../api';
import type { BootstrapPayload } from '../types';

export function Ideas({
  data,
  setData,
}: {
  data: BootstrapPayload;
  setData: React.Dispatch<React.SetStateAction<BootstrapPayload | null>>;
}) {
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('فكرة');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const idea = await createIdea(title, tag);
    setData({ ...data, ideas: [idea, ...data.ideas] });
    setTitle('');
  };

  const deleteIdea = (id: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedIdeas = prev.ideas.filter((i) => i.id !== id);
      try {
        const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
        legacy.ideas = updatedIdeas;
        const json = JSON.stringify(legacy);
        localStorage.setItem('wens-local-v1', json);
        void syncStorage(json);
      } catch {}
      return { ...prev, ideas: updatedIdeas };
    });
  };

  return (
    <>
      <PageTitle
        title="الأفكار"
        copy="التقط خواطرك وملاحظاتك فورًا، ونظّمها لما يحين وقت تنفيذها."
      />
      <form className="idea-capture" onSubmit={submit}>
        <Lightbulb size={24} style={{ color: 'var(--accent)' }} />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="دوّن الفكرة هنا قبل أن تنساها…"
          required
        />
        <input
          className="tag-input"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="تصنيف الفكرة"
        />
        <button className="primary-button">حفظ</button>
      </form>

      <div className="ideas-list">
        {data.ideas.length === 0 && (
          <div className="ideas-empty">
            <Lightbulb size={30} />
            <h2>مكان للأفكار قبل أن تصبح مشروعات</h2>
            <p>اكتب جملة واحدة الآن. لا تحتاج إلى خطة كاملة.</p>
          </div>
        )}
        {data.ideas.map((idea) => (
          <article key={idea.id}>
            <div
              className="idea-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{idea.tag}</span>
              <button
                type="button"
                className="icon-button danger"
                onClick={() => deleteIdea(idea.id)}
                aria-label={`حذف فكرة ${idea.title}`}
                title="حذف الفكرة"
              >
                <X size={16} />
              </button>
            </div>
            <h2>{idea.title}</h2>
            <p>{idea.body || 'لا توجد تفاصيل إضافية مسجلة بعد.'}</p>
          </article>
        ))}
      </div>
    </>
  );
}
