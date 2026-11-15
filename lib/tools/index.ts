import type { SourceTool } from '../types';
import { commonCrawlTool } from './common_crawl';
import { crtshTool } from './crt_sh';
import { fetchPageTool } from './fetch_page';
import { githubCodeTool } from './github_code';
import { webSearchTool } from './web_search';
import { waybackCdxTool } from './wayback_cdx';

export { commonCrawlTool, crtshTool, fetchPageTool, githubCodeTool, webSearchTool, waybackCdxTool };

/** Every tool, one per file. Documentation and tests iterate this list. */
export const TOOL_REGISTRY = [
  webSearchTool,
  waybackCdxTool,
  crtshTool,
  githubCodeTool,
  fetchPageTool,
  commonCrawlTool,
];

export function describeTools(): Array<{ name: SourceTool; description: string }> {
  return TOOL_REGISTRY.map((tool) => ({ name: tool.name, description: tool.description }));
}
