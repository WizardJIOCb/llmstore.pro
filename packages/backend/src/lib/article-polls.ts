type UnknownRecord = Record<string, unknown>;

export interface StoredArticlePollOption {
  id: string;
  text: string;
}

export interface StoredArticlePoll {
  question: string;
  options: StoredArticlePollOption[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function extractArticlePollConfig(metadataJson: UnknownRecord | null | undefined): StoredArticlePoll | null {
  if (!isRecord(metadataJson) || !isRecord(metadataJson.poll)) {
    return null;
  }

  const question = typeof metadataJson.poll.question === 'string' ? metadataJson.poll.question.trim() : '';
  const options = Array.isArray(metadataJson.poll.options)
    ? metadataJson.poll.options
      .map((item) => {
        if (!isRecord(item)) return null;
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const text = typeof item.text === 'string' ? item.text.trim() : '';
        return id && text ? { id, text } : null;
      })
      .filter((item): item is StoredArticlePollOption => Boolean(item))
    : [];

  if (!question || options.length < 2) {
    return null;
  }

  return {
    question,
    options,
  };
}

export function buildArticlePollView(
  poll: StoredArticlePoll,
  countsByOptionId: Map<string, number>,
  votedOptionId?: string | null,
) {
  const options = poll.options.map((option) => ({
    id: option.id,
    text: option.text,
    votes_count: countsByOptionId.get(option.id) ?? 0,
    share_percent: 0,
  }));
  const totalVotes = options.reduce((sum, option) => sum + option.votes_count, 0);

  return {
    question: poll.question,
    options: options.map((option) => ({
      ...option,
      share_percent: totalVotes > 0 ? Number(((option.votes_count / totalVotes) * 100).toFixed(1)) : 0,
    })),
    total_votes: totalVotes,
    has_voted: Boolean(votedOptionId && poll.options.some((option) => option.id === votedOptionId)),
    voted_option_id: votedOptionId && poll.options.some((option) => option.id === votedOptionId) ? votedOptionId : null,
  };
}
