import { MainPageData } from "@/lib/types";

interface MainPageProps {
  data: MainPageData;
  personSlug: string;
}

export default function MainPage({ data, personSlug }: MainPageProps) {
  const prefix = `/${personSlug}`;

  return (
    <div className="main-page">
      {/* Welcome Block */}
      <div className="welcome-block">
        <h2>Welcome to {data.encyclopediaName}</h2>
        <p>
          The free encyclopedia about{" "}
          <a href={`${prefix}/wiki/${data.featuredArticleSlug}`}>
            {data.personName}
          </a>{" "}
          &mdash; built from public career data.
        </p>
      </div>

      {/* Stats Bar */}
      <div className="stats-bar">
        This encyclopedia has <b>{data.totalArticles.toLocaleString()}</b> articles,{" "}
        <b>{data.totalSources.toLocaleString()}</b> sources, and{" "}
        <b>{data.totalCrossReferences.toLocaleString()}</b> cross-references.
      </div>

      {/* Portal Bar */}
      <div className="portal-bar">
        <b>Portals:</b>{" "}
        {data.portals.map((portal, index) => (
          <span key={portal.slug}>
            <a href={`${prefix}/wiki/${portal.slug}`}>
              {portal.name} <b>({portal.count})</b>
            </a>
            {index < data.portals.length - 1 && " · "}
          </span>
        ))}
      </div>

      {/* Two-Column Grid */}
      <div className="grid-2col">
        {/* Left Column */}
        <div>
          {/* Featured Article */}
          <div className="section-box">
            <div className="section-header feat">From today&apos;s featured article</div>
            <div className="section-body">
              <div
                dangerouslySetInnerHTML={{ __html: data.featuredArticleSummary }}
              />
              <div className="more">
                <a href={`${prefix}/wiki/${data.featuredArticleSlug}`}>Read full article &rarr;</a>
              </div>
            </div>
          </div>

          {/* Did You Know */}
          <div className="section-box">
            <div className="section-header dyk">Did you know&hellip;</div>
            <div className="section-body">
              <ul>
                {data.didYouKnow.map((item, index) => (
                  <li
                    key={index}
                    dangerouslySetInnerHTML={{ __html: item.fact }}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div>
          {/* In the Network */}
          <div className="section-box">
            <div className="section-header news">In the network</div>
            <div className="section-body">
              <ul>
                {data.recentPeople.map((person) => (
                  <li key={person.slug}>
                    <a href={`${prefix}/wiki/${person.slug}`}>{person.name}</a>
                    {person.description && ` — ${person.description}`}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Career Timeline */}
          <div className="section-box">
            <div className="section-header otd">Career timeline</div>
            <div className="section-body">
              <ul>
                {data.careerTimeline.map((entry, index) => (
                  <li key={index}>
                    {entry.year && <><b>{entry.year}</b> &mdash; </>}
                    <a href={`${prefix}/wiki/${entry.slug}`}>{entry.event}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
