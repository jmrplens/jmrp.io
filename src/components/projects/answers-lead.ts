/**
 * Which accepted answers lead the list on /projects/contributions/ and its
 * markdown twin. The author picks up to six (`answersLead` in
 * contributions.yaml); they come first, in that order, and are the ones the
 * page keeps in view. The rest keep the dataset's order (newest first), behind
 * a disclosure on the page and listed after the lead in the twin.
 *
 * The lead is a reference into data the author does not control: a
 * maintainer can un-accept an answer. An entry that matches no accepted
 * answer is dropped with a build warning instead of failing the build, so
 * the nightly rebuild cannot break over someone else's edit.
 *
 * @module
 */

/** One `answersLead` entry: the discussion's repository and number. */
export interface AnswerRef {
  readonly repo: string;
  readonly number: number;
}

/**
 * Splits the accepted answers into the author's lead and the rest.
 *
 * @param answers - The dataset's accepted answers, in its order.
 * @param lead - The author's picks, in display order.
 * @param warn - Warning sink (tests pass their own).
 * @returns The lead answers, then the others in the dataset's order.
 */
export function splitAnswers<A extends { fullName: string; number: number }>(
  answers: readonly A[],
  lead: readonly AnswerRef[],
  warn: (line: string) => void = console.warn,
): { lead: A[]; rest: A[] } {
  const picked: A[] = [];
  for (const ref of lead) {
    const match = answers.find(
      (a) => a.fullName === ref.repo && a.number === ref.number,
    );
    if (match) {
      if (!picked.includes(match)) picked.push(match);
    } else {
      warn(
        `contributions.yaml answersLead: ${ref.repo}#${ref.number} is not an accepted answer; left out.`,
      );
    }
  }
  return {
    lead: picked,
    rest: answers.filter((a) => !picked.includes(a)),
  };
}
