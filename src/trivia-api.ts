export interface TriviaResponse {
  response_code: number;
  results: TriviaResult[];
}

export interface TriviaResult {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export function getQuestions({
  amount = 10,
}: {
  amount: number;
}): TriviaResponse {
  if (amount < 1 || amount > 20) {
    throw new Error("Amount must be between 1 and 20");
  }

  const response = Http.request({
    method: "GET",
    url: `https://opentdb.com/api.php?amount=${amount}`,
  });
  return JSON.parse(response.body);
}
