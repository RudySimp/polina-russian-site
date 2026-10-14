import {
  exerciseIndex as exercises,
  publishedTopics,
  sections,
  sectionTitle,
  type Exam,
} from "../content/catalog";
import {
  Breadcrumbs,
  LinkButton,
  PageHeading,
  TopicCard,
} from "../components/ui";
import { href } from "../routes";
import { examName } from "../lib/search";

export function ExamPage({ exam }: { exam: Exam }) {
  const name = examName(exam);
  const available = publishedTopics.filter((topic) =>
    topic.examTags.includes(exam),
  );
  const practice = exercises.filter((exercise) => exercise.exam === exam);
  return (
    <>
      <Breadcrumbs items={[{ label: name }]} />
      <PageHeading
        eyebrow={`${name} · РУССКИЙ ЯЗЫК`}
        title={`Готовимся к ${name} осознанно`}
        text={
          exam === "OGE"
            ? "От грамматической основы к анализу предложения и слова. Изучайте темы по порядку или выбирайте нужный навык."
            : "Точность произношения, написания и пунктуации. Разбирайте трудные случаи и проверяйте каждое решение."
        }
      />
      <div className="exam-overview">
        <div>
          <h2>Ваш стартовый маршрут</h2>
          <ol className="route-list">
            {(exam === "OGE"
              ? ["osnova", "sintaksis", "punktuacionnyy-analiz"]
              : ["udarenie", "ne-prilagatelnye", "odnorodnye"]
            ).map((id) => {
              const topic = available.find((topic) => topic.id === id)!;
              return (
                <li key={id}>
                  <a href={href(`/theory/${topic.slug}/?exam=${exam}`)}>
                    {topic.title}
                  </a>
                  <p>{topic.description}</p>
                </li>
              );
            })}
          </ol>
        </div>
        <aside className="exam-note">
          <h2>Учитесь последовательно</h2>
          <p>
            Правило → интерактивный пример → практика → разбор → новое задание.
          </p>
          <p>
            <strong>{available.length} доступных тем</strong>
            <br />
            {practice.length} заданий этого направления.
          </p>
          <LinkButton to={`/practice/?exam=${exam}`}>
            Практика {name}
          </LinkButton>
          <a className="text-link" href={href(`/theory/?exam=${exam}`)}>
            Каталог учебника
          </a>
        </aside>
      </div>
      {sections
        .filter((section) =>
          available.some((topic) => topic.sectionId === section.id),
        )
        .map((section) => (
          <section className="home-section" key={section.id}>
            <div className="section-heading">
              <h2>{sectionTitle(section.id)}</h2>
            </div>
            <div className="topic-grid">
              {available
                .filter((topic) => topic.sectionId === section.id)
                .map((topic) => (
                  <TopicCard key={topic.id} topic={topic} exam={exam} />
                ))}
            </div>
          </section>
        ))}
      <div className="editorial-note">
        <h2>Что доступно сейчас</h2>
        <p>
          Это демонстрационная редакция части курса. Теория общая, практика
          разделена по экзамену и навыку. Авторские материалы Полины и её
          окончательное утверждение ещё ожидаются.
        </p>
        <p>
          Номера заданий ОГЭ в импортированной практике сверены с проектом ФИПИ
          2027 года. Статус проекта указан в задании; полный курс и итоговые
          экзаменационные баллы не заявляются.
        </p>
        <LinkButton to="/theory/?status=planned" secondary>
          Темы в подготовке
        </LinkButton>
      </div>
    </>
  );
}
