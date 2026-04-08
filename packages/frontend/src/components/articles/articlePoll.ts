type UnknownRecord = Record<string, unknown>;

export interface EditableArticlePollOption {
  id: string;
  text: string;
}

export interface EditableArticlePoll {
  question: string;
  options: EditableArticlePollOption[];
}

export interface ArticlePollOptionResult extends EditableArticlePollOption {
  votes_count: number;
  share_percent: number;
}

export interface ArticlePollResult {
  question: string;
  options: ArticlePollOptionResult[];
  total_votes: number;
  has_voted: boolean;
  voted_option_id: string | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createOptionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `poll-option-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createEditablePollOption(text = ''): EditableArticlePollOption {
  return {
    id: createOptionId(),
    text,
  };
}

function normalizePollOptions(input: unknown): EditableArticlePollOption[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createOptionId();
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      return text ? { id, text } : null;
    })
    .filter((item): item is EditableArticlePollOption => Boolean(item));
}

export function extractEditableArticlePoll(metadataJson: unknown): EditableArticlePoll | null {
  if (!isRecord(metadataJson) || !isRecord(metadataJson.poll)) {
    return null;
  }

  const question = typeof metadataJson.poll.question === 'string' ? metadataJson.poll.question.trim() : '';
  const options = normalizePollOptions(metadataJson.poll.options);

  if (!question && options.length === 0) {
    return null;
  }

  return {
    question,
    options: options.length > 0 ? options : [createEditablePollOption(), createEditablePollOption()],
  };
}

export function buildArticleMetadataJsonWithPoll(
  existingMetadataJson: UnknownRecord | null | undefined,
  poll: EditableArticlePoll | null,
): UnknownRecord | null {
  const metadataJson = isRecord(existingMetadataJson) ? { ...existingMetadataJson } : {};
  delete metadataJson.poll;

  const question = poll?.question.trim() ?? '';
  const options = (poll?.options ?? [])
    .map((option) => ({
      id: option.id.trim() || createOptionId(),
      text: option.text.trim(),
    }))
    .filter((option) => option.text);

  if (question && options.length >= 2) {
    metadataJson.poll = {
      question,
      options,
    };
  }

  return Object.keys(metadataJson).length > 0 ? metadataJson : null;
}

export function extractArticlePollResult(metadataJson: unknown): ArticlePollResult | null {
  if (!isRecord(metadataJson) || !isRecord(metadataJson.poll)) {
    return null;
  }

  const question = typeof metadataJson.poll.question === 'string' ? metadataJson.poll.question.trim() : '';
  if (!question) {
    return null;
  }

  const optionsSource = Array.isArray(metadataJson.poll.options) ? metadataJson.poll.options : [];
  const options = optionsSource
    .map((item) => {
      if (!isRecord(item)) return null;
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!id || !text) return null;

      return {
        id,
        text,
        votes_count: typeof item.votes_count === 'number' ? item.votes_count : 0,
        share_percent: typeof item.share_percent === 'number' ? item.share_percent : 0,
      };
    })
    .filter((item): item is ArticlePollOptionResult => Boolean(item));

  if (options.length < 2) {
    return null;
  }

  const votedOptionId = typeof metadataJson.poll.voted_option_id === 'string' && metadataJson.poll.voted_option_id.trim()
    ? metadataJson.poll.voted_option_id.trim()
    : null;
  const hasVoted = typeof metadataJson.poll.has_voted === 'boolean'
    ? metadataJson.poll.has_voted
    : Boolean(votedOptionId && options.some((option) => option.id === votedOptionId));
  const totalVotes = typeof metadataJson.poll.total_votes === 'number'
    ? metadataJson.poll.total_votes
    : options.reduce((sum, option) => sum + option.votes_count, 0);

  return {
    question,
    options,
    total_votes: totalVotes,
    has_voted: hasVoted && Boolean(votedOptionId && options.some((option) => option.id === votedOptionId)),
    voted_option_id: votedOptionId && options.some((option) => option.id === votedOptionId) ? votedOptionId : null,
  };
}
