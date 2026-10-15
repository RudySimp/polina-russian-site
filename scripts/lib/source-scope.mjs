// Reviewed against the extracted headings of these exact reference PDFs.
// The PDFs do not name an exam or year: a source task number is not an OGE line.
const reviewedTables = new Map([
  ['22a3bc45d5c234759ec5ccb55c8dd0ad355d7e78dbb8294d7e2863f3b462c78f', [9, 'Правописание гласных в корне']],
  ['5760816d047c4226b7b46a2c36e8fd2744f9f7563870b1b922e30f4cc800a0c5', [10, 'Правописание приставок']],
  ['131b1895ad518e073a802c621d81829629b20d4ae02b930ce6e26e6ede949914', [11, 'Правописание суффиксов']],
  ['debdd6457f42451cc8d77b41f7e5fa5c9c1789ecf39db2a0f39a35596e4c442c', [12, 'Личные окончания глаголов и суффиксы причастий']],
]);
export function reviewedSourceScope(sha256) {
  const entry = reviewedTables.get(sha256);
  if (!entry) return null;
  return {
    exam: 'OGE-reference', taskLine: null,
    sourceExam: 'unknown', sourceExamReview: 'not-stated-in-reviewed-pages',
    sourceTaskNumber: entry[0], sourceYear: null,
    targetOgeLines: [6, 7], targetLiteracyCriteria: ['ГК1'],
    materialKind: 'reference-theory-table', theme: entry[1],
    scopeReview: 'editorial-heading-review',
  };
}

const theoryLines = new Map([
 ["745605c4793babe11442f9c1353ae02d487299580812cca570d4a2fe53a44bba",[2]],
 ["cb7dbc991e3a25fb09b274a481796bb55d440a283813158fedfeb81c2ec8ea2c",[3]],
 ["62656f3d81b623352233c3e3d2b01f66b2e7ac08a9f4b3bf6788ec4856652961",[4,5]],
 ["e831eb375ac7010df5c4e81eee0822005db736011f05bc73b37c58ce8ad5f02a",[6,7]],
 ["dff6042b56226eb01c1c6886317d57ef6fd677d37042aaa135ea01128b1fd666",[8]],
 ["c4fb9ff70fc9c9c71615407d3cdaf49b16bfd1878866ddde5314d2a9517d0a9c",[9]],
 ["ad73ef41706f59bc9f7746d4328773a55e33910023fcc1d614b949323e02ecbe",[11]],
 ["04f9124183b621e9a1f5b92e7d10ee3f9bff151f28fd51baee9e9b21ac5fedc3",[12]],
]);
const modelKinds = new Map([
 ["1db946d4a90e897b4c07dea14a7f7f529358462346ce1d6c1bdee4a2f41e23a2","model-demo"],
 ["0ba7fcdd8f64c8fa6a40bff5f129224d46f7c3b59f5155fe36cff3f45d8f1e69","model-codifier"],
 ["0b746ce27c6dac5eb2876eaab14a119256b55f549661f85ca37baae1b094a19a","model-specification"],
]);
const oral = new Set(["4e4316aff9f3a653387f2b6ff9891a1af6cbc88fc661dfc6ccf06ca383f15854","e826b0b0b8f42c03248d5ee2ea178c26d0ccb6d8a9458d4af38e240b8bc5e1dd"]);
export function materialWorkScope(record) {
 const common={sourceExam:"unknown",sourceTaskNumber:record.taskLine??null,sourceYear:null,targetOgeLines:[],targetLiteracyCriteria:[],materialKind:"unclassified",workKind:"reference",courseUse:"needs-review",exclusionReason:null};
 if(record.bytes===0) return {...common,materialKind:"empty-file",workKind:"none",courseUse:"excluded",exclusionReason:"Пустой файл; пользовательский оригинал сохраняется."};
 if(record.sha256==="9fa6f2fb675be4441bf3f15950737043152b72f59acb0cbb3795b285e4483a40") return {...common,sourceExam:"not-applicable",sourceYear:2021,materialKind:"mathematics-article",workKind:"mathematics",courseUse:"excluded",exclusionReason:"Первая страница называет методику задач с параметрами и уравнения школьной математики; не курс русского языка.",scopeEvidence:"Текстовый слой PDF1: заголовок, аннотация и ключевые слова; exact SHA-256."};
 if(oral.has(record.sha256)) return {...common,sourceExam:"OGE",materialKind:"oral-interview-model",workKind:"oral-interview",courseUse:"excluded-from-written-course",exclusionReason:"Итоговое собеседование — отдельная устная работа, не письменные задания1–13."};
 if(modelKinds.has(record.sha256)) return {...common,sourceExam:"OGE",sourceYear:2027,materialKind:modelKinds.get(record.sha256),workKind:"written-exam-model",courseUse:"model-and-criteria-reference",targetOgeLines:Array.from({length:13},(_,n)=>n+1)};
 const table=reviewedSourceScope(record.sha256);
 if(table) return {...common,...table,workKind:"reference-theory",courseUse:"original-explanations-only"};
 if(theoryLines.has(record.sha256)) return {...common,sourceExam:"OGE",sourceTaskNumber:null,materialKind:"reference-theory",workKind:"reference-theory",courseUse:"original-explanations-only",targetOgeLines:theoryLines.get(record.sha256)};
 if(record.sha256==="fa4bed2fc59d95fbb56e519de591a6f2fcef89d5a95e15a0a7050b1763f942dd") return {...common,sourceExam:"OGE",sourceYear:2026,materialKind:"third-party-practice-compilation",workKind:"written-practice",courseUse:"quarantined-rights-and-subject-review",exclusionReason:"Название файла не подтверждает официальное происхождение; сторонние условия не публикуются автоматически."};
 if(record.origin==="original-training-catalog") return {...common,sourceExam:"OGE",materialKind:"declared-original-practice-catalog",workKind:"written-practice",courseUse:"candidate-by-candidate-review",targetOgeLines:record.taskLine?[record.taskLine]:[]};
 if(record.origin==="third-party-compilation") return {...common,sourceExam:"OGE",materialKind:"third-party-practice-compilation",workKind:"written-practice",courseUse:"quarantined-rights-and-subject-review"};
 if(record.exam==="EGE-reference") return {...common,materialKind:record.origin==="third-party-textbook"?"upper-school-textbook":"ege-demo",sourceExam:record.origin==="third-party-textbook"?"not-applicable":"EGE",courseUse:"excluded-from-current-development",exclusionReason:"ЕГЭ и старшая школа зарегистрированы отдельно; развитие ЕГЭ не поручено."};
 if(record.origin==="third-party-textbook") return {...common,sourceExam:"not-applicable",materialKind:"school-textbook-reference",courseUse:"reference-only-pending-subject-review"};
 return common;
}
