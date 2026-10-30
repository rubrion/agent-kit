// Every visible text, so an app can translate or rename ("Assistant", the agent's
// name…). English by default; ptBR ready to pass as `strings`.

export interface Strings {
	assistant: string;
	/** Under the title in the chat box. */
	scope: string;
	newConversation: string;
	expand: string;
	close: string;
	open: string;
	placeholder: string;
	ask: string;
	stop: string;
	jumpToEnd: string;
	writing: string;
	thinking: string;
	thoughtFor: (seconds: number) => string;
	details: string;
	copy: string;
	copied: string;
	emptyTitle: string;
	greeting: (firstName: string) => string;
	greetingHint: string;
	disclaimer: string;
	offline: string;
	tryAgainSoon: string;
	failed: string;
	connectionLost: string;
	conversations: string;
	searchConversations: string;
	conversationsEmpty: string;
	conversationsNoMatch: string;
	deleteConversation: string;
	confirmDelete: (title: string) => string;
	chooseAgent: string;
	thinks: string;
	collapse: string;
	notReady: string;
	locale: string;
}

export const en: Strings = {
	assistant: 'Assistant',
	scope: 'all of your data',
	newConversation: 'New conversation',
	expand: 'Expand',
	close: 'Close',
	open: 'Open the assistant',
	placeholder: 'Ask anything…',
	ask: 'Ask',
	stop: 'Stop',
	jumpToEnd: 'Jump to the end',
	writing: 'Writing',
	thinking: 'Thinking…',
	thoughtFor: (s) => `Thought for ${s}s`,
	details: 'Details',
	copy: 'Copy',
	copied: 'Copied',
	emptyTitle: 'Ask me anything',
	greeting: (n) => (n ? `Hi, ${n}` : 'Hi'),
	greetingHint: 'Ask a question to get started.',
	disclaimer: 'The assistant reads your data and can make mistakes. Check before you decide.',
	offline: 'The assistant is offline right now.',
	tryAgainSoon: 'Try again in a moment.',
	failed: 'The assistant could not answer right now. Try again.',
	connectionLost: 'The connection to the assistant dropped. Try again.',
	conversations: 'Conversations',
	searchConversations: 'Search conversations',
	conversationsEmpty: 'Conversations show up here after the first question.',
	conversationsNoMatch: 'No conversation matches.',
	deleteConversation: 'Delete conversation',
	confirmDelete: (t) => `Delete "${t}"? The assistant forgets what was said in it.`,
	chooseAgent: 'Choose the agent',
	thinks: 'thinks',
	collapse: 'Collapse the conversations',
	notReady: 'The assistant cannot answer right now.',
	locale: 'en',
};

export const ptBR: Strings = {
	assistant: 'Assistente',
	scope: 'todos os seus dados',
	newConversation: 'Nova conversa',
	expand: 'Expandir',
	close: 'Fechar',
	open: 'Abrir o assistente',
	placeholder: 'Pergunte qualquer coisa…',
	ask: 'Perguntar',
	stop: 'Parar',
	jumpToEnd: 'Ir para o fim',
	writing: 'Escrevendo',
	thinking: 'Pensando…',
	thoughtFor: (s) => `Pensou por ${s}s`,
	details: 'Detalhes',
	copy: 'Copiar',
	copied: 'Copiado',
	emptyTitle: 'Pergunte o que quiser',
	greeting: (n) => (n ? `Olá, ${n}` : 'Olá'),
	greetingHint: 'Faça uma pergunta para começar.',
	disclaimer: 'O assistente consulta os seus dados e pode errar. Confira antes de decidir.',
	offline: 'O assistente está fora do ar agora.',
	tryAgainSoon: 'Tente de novo em instantes.',
	failed: 'O assistente não conseguiu responder agora. Tente de novo.',
	connectionLost: 'A conexão com o assistente caiu. Tente de novo.',
	conversations: 'Conversas',
	searchConversations: 'Buscar conversas',
	conversationsEmpty: 'As conversas aparecem aqui depois da primeira pergunta.',
	conversationsNoMatch: 'Nenhuma conversa com esse termo.',
	deleteConversation: 'Apagar conversa',
	confirmDelete: (t) => `Apagar "${t}"? O assistente esquece o que foi dito nela.`,
	chooseAgent: 'Escolher o agente',
	thinks: 'pensa',
	collapse: 'Recolher as conversas',
	notReady: 'O assistente não pode responder agora.',
	locale: 'pt-BR',
};
