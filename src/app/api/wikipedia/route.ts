import { NextRequest, NextResponse } from 'next/server';

type MonthlyData = {
  items: Array<{
    project: string;
    article: string;
    granularity: string;
    timestamp: string;
    access: string;
    agent: string;
    views: number;
  }>;
};

type YearlyPageviews = {
  [year: string]: number;
};

function aggregateByYear(data: MonthlyData): { yearlyViews: YearlyPageviews; trend: string; peakYear: number | null } {
  const yearlyViews: YearlyPageviews = {};

  if (!data.items || !Array.isArray(data.items)) {
    return { yearlyViews: {}, trend: 'unknown', peakYear: null };
  }

  for (const item of data.items) {
    const year = item.timestamp.slice(0, 4);
    if (!yearlyViews[year]) {
      yearlyViews[year] = 0;
    }
    yearlyViews[year] += item.views;
  }

  const years = Object.keys(yearlyViews).sort();
  const fullYears = years.filter(y => {
    const year = parseInt(y);
    return year >= 2016 && year <= new Date().getFullYear() - 1;
  });

  let trend = 'stable';
  if (fullYears.length >= 4) {
    const earlyYears = fullYears.slice(0, 2);
    const lateYears = fullYears.slice(-2);
    const earlyAvg = earlyYears.reduce((sum, y) => sum + yearlyViews[y], 0) / 2;
    const lateAvg = lateYears.reduce((sum, y) => sum + yearlyViews[y], 0) / 2;

    if (lateAvg > earlyAvg * 1.15) trend = 'rising';
    else if (lateAvg < earlyAvg * 0.85) trend = 'declining';
  }

  let peakYear: number | null = null;
  let peakViews = 0;
  for (const year of fullYears) {
    if (yearlyViews[year] > peakViews) {
      peakViews = yearlyViews[year];
      peakYear = parseInt(year);
    }
  }

  return { yearlyViews, trend, peakYear };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  const wantPageviews = searchParams.get('pageviews') === '1';

  if (!slug) {
    return NextResponse.json({ error: 'Slug required' }, { status: 400 });
  }

  if (wantPageviews) {
    try {
      const startDate = '20150701';
      const endDate = new Date().toISOString().slice(0, 7).replace('-', '') + '01';
      const article = encodeURIComponent(slug.replace(/-/g, '_'));
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${article}/monthly/${startDate}/${endDate}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'HistoryRank/1.0 (https://historyrank.org; research project)',
        },
        next: { revalidate: 86400 },
      });

      if (!response.ok) {
        const altArticle = encodeURIComponent(slug.replace(/-/g, ' '));
        const altUrl = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${altArticle}/monthly/${startDate}/${endDate}`;

        const altResponse = await fetch(altUrl, {
          headers: {
            'User-Agent': 'HistoryRank/1.0 (https://historyrank.org; research project)',
          },
          next: { revalidate: 86400 },
        });

        if (!altResponse.ok) {
          return NextResponse.json({
            yearlyViews: null,
            error: 'No pageview data available',
          });
        }

        const altData: MonthlyData = await altResponse.json();
        return NextResponse.json(aggregateByYear(altData));
      }

      const data: MonthlyData = await response.json();
      return NextResponse.json(aggregateByYear(data));
    } catch (error) {
      console.error('Wikimedia Pageviews API error:', error);
      return NextResponse.json({
        yearlyViews: null,
        error: 'Failed to fetch pageview data',
      });
    }
  }

  try {
    const wikiUrl = new URL('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(slug));

    const response = await fetch(wikiUrl.toString(), {
      headers: {
        'User-Agent': 'HistoryRank/1.0 (research project)',
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
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
