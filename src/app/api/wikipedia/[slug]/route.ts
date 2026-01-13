import { NextRequest, NextResponse } from 'next/server';

interface WikipediaResponse {
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  extract?: string;
  title?: string;
  pageid?: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: 'Slug required' }, { status: 400 });
  }

  try {
    // Wikipedia API - get page summary with thumbnail and extract
    const wikiUrl = new URL('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(slug));

    const response = await fetch(wikiUrl.toString(), {
      headers: {
        'User-Agent': 'HistoryRank/1.0 (research project)',
      },
      next: { revalidate: 86400 }, // Cache for 24 hours
    });

    if (!response.ok) {
      // Try with different formatting (replace dashes with underscores)
      const altSlug = slug.replace(/-/g, '_');
      const altUrl = new URL('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(altSlug));

      const altResponse = await fetch(altUrl.toString(), {
        headers: {
          'User-Agent': 'HistoryRank/1.0 (research project)',
        },
        next: { revalidate: 86400 },
      });

      if (!altResponse.ok) {
        return NextResponse.json({
          thumbnail: null,
          extract: null,
          title: null,
        });
      }

      const altData = await altResponse.json();
      return NextResponse.json({
        thumbnail: altData.thumbnail || null,
        extract: altData.extract || null,
        title: altData.title || null,
        pageid: altData.pageid || null,
      });
    }

    const data = await response.json();

    return NextResponse.json({
      thumbnail: data.thumbnail || null,
      extract: data.extract || null,
      title: data.title || null,
      pageid: data.pageid || null,
    });
  } catch (error) {
    console.error('Wikipedia API error:', error);
    return NextResponse.json({
      thumbnail: null,
      extract: null,
      title: null,
    });
  }
}
