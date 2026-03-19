export interface SlashMenuState {
  noteId: string;
  blockIndex: number;
  position: { top: number; left: number };
  filter: string;
}

export interface WikilinkMenuState {
  noteId: string;
  blockIndex: number;
  rect: { top: number; left: number };
  filter: string;
}

export interface ToolbarState {
  top: number;
  left: number;
}

export interface LinkPopoverState {
  blockId: string;
  url: string;
  text: string;
  range: Range;
}

export interface LightboxState {
  src: string;
  alt?: string;
}
