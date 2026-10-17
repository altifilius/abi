import { describe, expect, it } from 'bun:test';
import { parseProductRoute } from '../services/navigation';

describe('Project studio route boundaries', () => {
  it('distinguishes independent idea/report sessions and full documents', () => {
    expect(parseProductRoute('/w/team/projects/idea/ai/idea')).toMatchObject({
      menu: 'projects',
      workspaceId: 'team',
      projectId: 'idea',
      section: 'ai',
      aiMode: 'idea',
    });
    expect(parseProductRoute('/w/team/projects/idea/ai/reports')).toMatchObject({
      section: 'ai',
      aiMode: 'reports',
      projectId: 'idea',
    });
    expect(parseProductRoute('/w/team/projects/idea/reports/report')).toMatchObject({
      section: 'report',
      reportId: 'report',
      projectId: 'idea',
    });
  });
  it('does not treat malformed document paths or extra segments as the project file', () => {
    for (const path of [
      '/w/team/projects/idea/reports',
      '/w/team/projects/idea/reports/report/extra',
      '/w/team/projects/idea/ai/other',
      '/w/team/projects/idea/conversation',
    ])
      expect(parseProductRoute(path).menu).toBe('not-found');
  });
  it('keeps workspace diagnostics contextual and tenant-scoped', () => {
    expect(parseProductRoute('/w/team/workspace/activity')).toEqual({
      menu: 'workspace',
      workspaceId: 'team',
      section: 'activity',
    });
    expect(parseProductRoute('/w/team/workspace/activity/other').menu).toBe('not-found');
  });
});
