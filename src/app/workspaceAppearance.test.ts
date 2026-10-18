import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_APPEARANCE,
  normalizeWorkspaceAppearance,
  workspaceBackgroundStyle,
  workspaceTitleStyle,
} from './workspaceAppearance'
import { normalizeItemPresentation } from './itemPresentation'

describe('bounded workspace personalization', () => {
  it('keeps safe defaults for absent and hostile values', () => {
    expect(normalizeWorkspaceAppearance(null)).toEqual(
      DEFAULT_WORKSPACE_APPEARANCE,
    )
    const value = normalizeWorkspaceAppearance({
      icon: '<svg onload=alert(1)>',
      iconColor: 'url(https://bad.test/a)',
      titleFont: 'url(https://bad.test/font)',
      backgroundAssetId: 'https://bad.test/image.gif',
      backgroundColor: 'red; background:url(x)',
      gradientTo: 'transparent);url(x)',
      description: '<script>literal text</script>',
    })
    expect(value.icon).toBe('briefcase')
    expect(value.titleFont).toBe('system')
    expect(value.backgroundAssetId).toBeNull()
    expect(value.iconColor).toBeNull()
    expect(value.backgroundColor).toBeNull()
    expect(value.gradientTo).toBe(DEFAULT_WORKSPACE_APPEARANCE.gradientTo)
    expect(value.description).toBe('<script>literal text</script>')
  })
  it('bounds all geometry and preserves valid saved identity and media references', () => {
    const value = normalizeWorkspaceAppearance({
      iconSize: 9999,
      iconStrokeWidth: -10,
      titleSize: 0,
      titleWeight: 750,
      titleOutlineWidth: 20,
      spacing: -1,
      backgroundOpacity: -1,
      gradientOpacity: 101,
      gradientAngle: Infinity,
      backgroundAssetId: 'a'.repeat(64),
      titleColor: '#aabbcc',
      titleFont: 'Georgia',
      description: 'a'.repeat(1400),
      tagline: 'b'.repeat(200),
    })
    expect(value).toMatchObject({
      iconSize: 112,
      iconStrokeWidth: 0.5,
      titleSize: 14,
      titleWeight: 800,
      titleOutlineWidth: 3,
      spacing: 4,
      backgroundOpacity: 0,
      gradientOpacity: 100,
      gradientAngle: 135,
      backgroundAssetId: 'a'.repeat(64),
      titleColor: '#AABBCC',
      titleFont: 'Georgia',
    })
    expect(value.description).toHaveLength(1200)
    expect(value.tagline).toHaveLength(160)
    expect(
      normalizeWorkspaceAppearance(JSON.parse(JSON.stringify(value))),
    ).toEqual(value)
  })
  it('rejects every remote or executable image URL when rendering backgrounds', () => {
    for (const url of [
      'https://example.test/a.gif',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'blob:https://evil.test/id',
      'data:image/png;base64,abc");background:red',
    ])
      expect(
        workspaceBackgroundStyle({}, url)[
          '--home-background-image' as keyof ReturnType<
            typeof workspaceBackgroundStyle
          >
        ],
      ).toBe('none')
    expect(
      workspaceBackgroundStyle(
        {
          backgroundFit: 'tile',
          gradientEnabled: true,
          gradientFrom: '#102030',
          gradientTo: '#405060',
          gradientAngle: 90,
        },
        'data:image/gif;base64,R0lGODlh',
      ),
    ).toMatchObject({
      '--home-background-image': 'url("data:image/gif;base64,R0lGODlh")',
      '--home-background-repeat': 'repeat',
      '--home-background-size': 'auto',
      '--home-gradient': 'linear-gradient(90deg, #102030, #405060)',
    })
  })
  it('allows only exact immutable local asset routes with no CSS or remote URL injection', () => {
    const route = '/__canvas_live_library/assets/' + 'a'.repeat(64)
    expect(workspaceBackgroundStyle({}, route)).toMatchObject({
      '--home-background-image': `url("${route}")`,
    })
    for (const url of [
      route + '?q=x',
      route + '/extra',
      '//evil.test/image.gif',
      '/__canvas_live_library/assets/../../file',
      'blob:https://evil.test/token',
    ])
      expect(workspaceBackgroundStyle({}, url)).toMatchObject({
        '--home-background-image': 'none',
      })
  })
  it('uses only whitelisted local fonts and independent inner and outline colors', () => {
    expect(
      workspaceTitleStyle({
        titleFont: 'Georgia',
        titleColor: '#112233',
        titleOutlineColor: '#445566',
        titleOutlineWidth: 1.5,
      }),
    ).toMatchObject({
      fontFamily: '"Georgia", serif',
      color: '#112233',
      WebkitTextStroke: '1.5px #445566',
    })
    expect(
      workspaceTitleStyle({ titleFont: 'external-font', titleOutlineWidth: 2 })
        .WebkitTextStroke,
    ).toBeUndefined()
  })
  it('normalizes CLF and CLP decorations without interpreting descriptions', () => {
    expect(normalizeItemPresentation(null, 'folder').icon).toBe('folder')
    expect(
      normalizeItemPresentation({
        icon: 'star',
        color: '#abcdef',
        fill: 'url(x)',
        borderColor: '#123456',
        description: 'a\r\nb'.repeat(500),
      }),
    ).toMatchObject({
      icon: 'star',
      color: '#ABCDEF',
      fill: null,
      borderColor: '#123456',
    })
    expect(
      normalizeItemPresentation({ description: 'x'.repeat(1000) }).description,
    ).toHaveLength(600)
  })
})
