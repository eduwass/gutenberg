/**
 * WordPress dependencies
 */

import {
	useRef,
	useState,
	useEffect,
	useContext,
	useCallback,
	createContext,
	Children,
	cloneElement,
} from '@wordpress/element';
import { focus } from '@wordpress/dom';

/**
 * Internal dependencies
 */
import useCreatePage from './use-create-page';
import useInternalInputValue from './use-internal-input-value';
import { ViewerFill } from './viewer-slot';
import { DEFAULT_LINK_SETTINGS } from './constants';
import { LinkControlDefault } from './link-control-default';
import LinkControlSettingsDrawer from './settings-drawer';
import LinkControlSearchInput from './search-input';
import LinkControlTextInput from './link-control-text-input';
import LinkPreview from './link-preview';
import LinkControlNotice from './link-control-notice';
import LinkControlEditControls from './link-control-edit-controls';
import LinkControlLoading from './link-control-loading';

/**
 * Default properties associated with a link control value.
 *
 * @typedef WPLinkControlDefaultValue
 *
 * @property {string}   url           Link URL.
 * @property {string=}  title         Link title.
 * @property {boolean=} opensInNewTab Whether link should open in a new browser
 *                                    tab. This value is only assigned if not
 *                                    providing a custom `settings` prop.
 */

/* eslint-disable jsdoc/valid-types */
/**
 * Custom settings values associated with a link.
 *
 * @typedef {{[setting:string]:any}} WPLinkControlSettingsValue
 */
/* eslint-enable */

/**
 * Custom settings values associated with a link.
 *
 * @typedef WPLinkControlSetting
 *
 * @property {string} id    Identifier to use as property for setting value.
 * @property {string} title Human-readable label to show in user interface.
 */

/**
 * Properties associated with a link control value, composed as a union of the
 * default properties and any custom settings values.
 *
 * @typedef {WPLinkControlDefaultValue&WPLinkControlSettingsValue} WPLinkControlValue
 */

/** @typedef {(nextValue:WPLinkControlValue)=>void} WPLinkControlOnChangeProp */

/**
 * Properties associated with a search suggestion used within the LinkControl.
 *
 * @typedef WPLinkControlSuggestion
 *
 * @property {string} id    Identifier to use to uniquely identify the suggestion.
 * @property {string} type  Identifies the type of the suggestion (eg: `post`,
 *                          `page`, `url`...etc)
 * @property {string} title Human-readable label to show in user interface.
 * @property {string} url   A URL for the suggestion.
 */

/** @typedef {(title:string)=>WPLinkControlSuggestion} WPLinkControlCreateSuggestionProp */

/**
 * @typedef WPLinkControlProps
 *
 * @property {(WPLinkControlSetting[])=}  settings                   An array of settings objects. Each object will used to
 *                                                                   render a `ToggleControl` for that setting.
 * @property {boolean=}                   forceIsEditingLink         If passed as either `true` or `false`, controls the
 *                                                                   internal editing state of the component to respective
 *                                                                   show or not show the URL input field.
 * @property {WPLinkControlValue=}        value                      Current link value.
 * @property {WPLinkControlOnChangeProp=} onChange                   Value change handler, called with the updated value if
 *                                                                   the user selects a new link or updates settings.
 * @property {boolean=}                   noDirectEntry              Whether to allow turning a URL-like search query directly into a link.
 * @property {boolean=}                   showSuggestions            Whether to present suggestions when typing the URL.
 * @property {boolean=}                   showInitialSuggestions     Whether to present initial suggestions immediately.
 * @property {boolean=}                   withCreateSuggestion       Whether to allow creation of link value from suggestion.
 * @property {Object=}                    suggestionsQuery           Query parameters to pass along to wp.blockEditor.__experimentalFetchLinkSuggestions.
 * @property {boolean=}                   noURLSuggestion            Whether to add a fallback suggestion which treats the search query as a URL.
 * @property {boolean=}                   hasTextControl             Whether to add a text field to the UI to update the value.title.
 * @property {string|Function|undefined}  createSuggestionButtonText The text to use in the button that calls createSuggestion.
 * @property {Function}                   renderControlBottom        Optional controls to be rendered at the bottom of the component.
 */

const noop = () => {};

const LinkControlContext = createContext();
LinkControlContext.displayName = 'LinkControlContext';

export function useLinkControlContext() {
	const context = useContext( LinkControlContext );
	if ( ! context ) {
		throw new Error(
			`LinkControl compound components cannot be rendered outside the LinkControl component`
		);
	}
	return context;
}

/**
 * Renders a link control. A link control is a controlled input which maintains
 * a value associated with a link (HTML anchor element) and relevant settings
 * for how that link is expected to behave.
 *
 * @param {WPLinkControlProps} props Component props.
 */
function LinkControl( {
	searchInputPlaceholder,
	value,
	settings = DEFAULT_LINK_SETTINGS,
	onChange = noop,
	onRemove,
	noDirectEntry = false,
	showSuggestions = true,
	showInitialSuggestions,
	forceIsEditingLink,
	createSuggestion,
	withCreateSuggestion,
	inputValue: propInputValue = '',
	suggestionsQuery = {},
	noURLSuggestion = false,
	createSuggestionButtonText,
	hasRichPreviews = false,
	hasTextControl = false,
	renderControlBottom = null,
	children,
} ) {
	if ( withCreateSuggestion === undefined && createSuggestion ) {
		withCreateSuggestion = true;
	}

	const isMounting = useRef( true );
	const wrapperNode = useRef();
	const textInputRef = useRef();
	const isEndingEditWithFocus = useRef( false );

	const [ internalUrlInputValue, setInternalUrlInputValue ] =
		useInternalInputValue( value?.url || '' );

	const [ internalTextInputValue, setInternalTextInputValue ] =
		useInternalInputValue( value?.title || '' );

	const [ isEditingLink, setIsEditingLink ] = useState(
		forceIsEditingLink !== undefined
			? forceIsEditingLink
			: ! value || ! value.url
	);

	const {
		createPage,
		isCreatingPage,
		errorMessage: createPageErrorMessage,
	} = useCreatePage( createSuggestion );

	useEffect( () => {
		if (
			forceIsEditingLink !== undefined &&
			forceIsEditingLink !== isEditingLink
		) {
			setIsEditingLink( forceIsEditingLink );
		}
	}, [ forceIsEditingLink ] );

	useEffect( () => {
		// We don't auto focus into the Link UI on mount
		// because otherwise using the keyboard to select text
		// *within* the link format is not possible.
		if ( isMounting.current ) {
			isMounting.current = false;
			return;
		}
		// Unless we are mounting, we always want to focus either:
		// - the URL input
		// - the first focusable element in the Link UI.
		// But in editing mode if there is a text input present then
		// the URL input is at index 1. If not then it is at index 0.
		const whichFocusTargetIndex = textInputRef?.current ? 1 : 0;

		// Scenario - when:
		// - switching between editable and non editable LinkControl
		// - clicking on a link
		// ...then move focus to the *first* element to avoid focus loss
		// and to ensure focus is *within* the Link UI.
		const nextFocusTarget =
			focus.focusable.find( wrapperNode.current )[
				whichFocusTargetIndex
			] || wrapperNode.current;

		nextFocusTarget.focus();

		isEndingEditWithFocus.current = false;
	}, [ isEditingLink, isCreatingPage ] );

	/**
	 * Cancels editing state and marks that focus may need to be restored after
	 * the next render, if focus was within the wrapper when editing finished.
	 */
	const stopEditing = () => {
		isEndingEditWithFocus.current = !! wrapperNode.current?.contains(
			wrapperNode.current.ownerDocument.activeElement
		);

		setIsEditingLink( false );
	};

	const handleSelectSuggestion = ( updatedValue ) => {
		onChange( {
			...updatedValue,
			title: internalTextInputValue || updatedValue?.title,
		} );
		stopEditing();
	};

	const currentUrlInputValue = propInputValue || internalUrlInputValue;

	const handleSubmit = useCallback( () => {
		if (
			currentUrlInputValue !== value?.url ||
			internalTextInputValue !== value?.title
		) {
			onChange( {
				...value,
				url: currentUrlInputValue,
				title: internalTextInputValue,
			} );
		}
		stopEditing();
	}, [ currentUrlInputValue, value, internalTextInputValue ] );

	const onEditClick = useCallback(
		() => setIsEditingLink( true ),
		[ setIsEditingLink ]
	);

	const currentInputIsEmpty = ! currentUrlInputValue?.trim()?.length;

	const shownUnlinkControl =
		onRemove && value && ! isEditingLink && ! isCreatingPage;

	const showSettingsDrawer = !! settings?.length;

	// Only show text control once a URL value has been committed
	// and it isn't just empty whitespace.
	// See https://github.com/WordPress/gutenberg/pull/33849/#issuecomment-932194927.
	const showTextControl = value?.url?.trim()?.length > 0 && hasTextControl;

	const shouldShowEditControls =
		( isEditingLink || ! value ) && ! isCreatingPage;

	const shouldShowLinkPreview = value && ! isEditingLink && ! isCreatingPage;

	const isLoading = isCreatingPage;

	// Consumers can pass in custom functions which may return
	// a different references resulting in the context being
	// invalidated causing all context consumers to re-render.
	// Memoize these callbacks to avoid this.
	const memoizedOnChange = useCallback( onChange, [] );
	const memoizedOnRemove = useCallback( onRemove, [] );

	// Todo
	// - memoize context value
	// - create seperate context's to avoid re-renders
	const contextValue = {
		value,
		onChange: memoizedOnChange,
		onRemove: memoizedOnRemove,
		settings, // todo: consider memoizing
		internalTextInputValue, // lift to standard state mechanic
		setInternalTextInputValue, // lift to standard state mechanic
		showTextControl,
		currentInputIsEmpty,
		handleSubmit,
		currentUrlInputValue,
		createPageErrorMessage, // needs extracting to generic error message
		shouldShowEditControls,
		shouldShowLinkPreview,
		showSettingsDrawer,
		isLoading,
		hasRichPreviews,
		shownUnlinkControl,
		onEditClick,
		textInputRef,
	};

	return (
		<LinkControlContext.Provider value={ contextValue }>
			<div
				tabIndex={ -1 }
				ref={ wrapperNode }
				className="block-editor-link-control"
			>
				{ children ? (
					Children.map( children, ( child ) =>
						cloneElement( child, {
							searchInputPlaceholder,
							withCreateSuggestion,
							createPage,
							setInternalUrlInputValue,
							handleSelectSuggestion,
							showInitialSuggestions,
							noDirectEntry,
							showSuggestions,
							suggestionsQuery,
							noURLSuggestion,
							createSuggestionButtonText,
							showTextControl,
							renderControlBottom,
						} )
					)
				) : (
					<LinkControlDefault
						searchInputPlaceholder={ searchInputPlaceholder }
						withCreateSuggestion={ withCreateSuggestion }
						createPage={ createPage }
						setInternalUrlInputValue={ setInternalUrlInputValue }
						handleSelectSuggestion={ handleSelectSuggestion }
						showInitialSuggestions={ showInitialSuggestions }
						noDirectEntry={ noDirectEntry }
						showSuggestions={ showSuggestions }
						suggestionsQuery={ suggestionsQuery }
						noURLSuggestion={ noURLSuggestion }
						createSuggestionButtonText={
							createSuggestionButtonText
						}
						showTextControl={ showTextControl }
						renderControlBottom={ renderControlBottom }
					/>
				) }
			</div>
		</LinkControlContext.Provider>
	);
}

LinkControl.ViewerFill = ViewerFill;

// Sub-components.
LinkControl.DefaultComponents = LinkControlDefault;
LinkControl.SettingsDrawer = LinkControlSettingsDrawer;
LinkControl.SearchInput = LinkControlSearchInput;
LinkControl.TextInput = LinkControlTextInput;
LinkControl.Preview = LinkPreview;
LinkControl.Notice = LinkControlNotice;
LinkControl.EditControls = LinkControlEditControls;
LinkControl.Loading = LinkControlLoading;

export default LinkControl;
