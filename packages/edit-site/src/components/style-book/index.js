/**
 * External dependencies
 */
import clsx from 'clsx';

/**
 * WordPress dependencies
 */
import {
	Disabled,
	Composite,
	privateApis as componentsPrivateApis,
} from '@wordpress/components';
import { __, _x, sprintf } from '@wordpress/i18n';
import {
	BlockList,
	privateApis as blockEditorPrivateApis,
	store as blockEditorStore,
	useSettings,
	BlockEditorProvider,
	__unstableEditorStyles as EditorStyles,
	__unstableIframe as Iframe,
	__experimentalUseMultipleOriginColorsAndGradients as useMultipleOriginColorsAndGradients,
} from '@wordpress/block-editor';
import { privateApis as editorPrivateApis } from '@wordpress/editor';
import { useSelect, dispatch } from '@wordpress/data';
import { useResizeObserver } from '@wordpress/compose';
import {
	useMemo,
	useState,
	memo,
	useContext,
	useRef,
	useLayoutEffect,
} from '@wordpress/element';
import { ENTER, SPACE } from '@wordpress/keycodes';

/**
 * Internal dependencies
 */
import { unlock } from '../../lock-unlock';
import EditorCanvasContainer from '../editor-canvas-container';
import { STYLE_BOOK_IFRAME_STYLES } from './constants';
import {
	getExamplesByCategory,
	getTopLevelStyleBookCategories,
} from './categories';
import { getExamples } from './examples';
import { store as siteEditorStore } from '../../store';

const {
	ExperimentalBlockEditorProvider,
	useGlobalStyle,
	GlobalStylesContext,
	useGlobalStylesOutputWithConfig,
} = unlock( blockEditorPrivateApis );
const { mergeBaseAndUserConfigs } = unlock( editorPrivateApis );

const { Tabs } = unlock( componentsPrivateApis );

function isObjectEmpty( object ) {
	return ! object || Object.keys( object ).length === 0;
}

/**
 * Scrolls to a section within an iframe.
 *
 * @param {string}            anchorId The id of the element to scroll to.
 * @param {HTMLIFrameElement} iframe   The target iframe.
 */
const scrollToSection = ( anchorId, iframe ) => {
	if ( ! anchorId || ! iframe || ! iframe?.contentDocument ) {
		return;
	}

	const element =
		anchorId === 'top'
			? iframe.contentDocument.body
			: iframe.contentDocument.getElementById( anchorId );
	if ( element ) {
		element.scrollIntoView( {
			behavior: 'smooth',
		} );
	}
};

/**
 * Parses a Block Editor navigation path to extract the block name and
 * build a style book navigation path. The object can be extended to include a category,
 * representing a style book tab/section.
 *
 * @param {string} path An internal Block Editor navigation path.
 * @return {null|{block: string}} An object containing the example to navigate to.
 */
const getStyleBookNavigationFromPath = ( path ) => {
	if ( path && typeof path === 'string' ) {
		if ( path === '/' ) {
			return {
				top: true,
			};
		}

		if ( path.startsWith( '/typography' ) ) {
			return {
				block: 'typography',
			};
		}
		let block = path.includes( '/blocks/' )
			? decodeURIComponent( path.split( '/blocks/' )[ 1 ] )
			: null;
		// Default to theme-colors if the path ends with /colors.
		block = path.endsWith( '/colors' ) ? 'theme-colors' : block;

		return {
			block,
		};
	}
	return null;
};

/**
 * Retrieves colors, gradients, and duotone filters from Global Styles.
 * The inclusion of default (Core) palettes is controlled by the relevant
 * theme.json property e.g. defaultPalette, defaultGradients, defaultDuotone.
 *
 * @return {Object} Object containing properties for each type of palette.
 */
function useMultiOriginPalettes() {
	const { colors, gradients } = useMultipleOriginColorsAndGradients();

	// Add duotone filters to the palettes data.
	const [
		shouldDisplayDefaultDuotones,
		customDuotones,
		themeDuotones,
		defaultDuotones,
	] = useSettings(
		'color.defaultDuotone',
		'color.duotone.custom',
		'color.duotone.theme',
		'color.duotone.default'
	);

	const palettes = useMemo( () => {
		const result = { colors, gradients, duotones: [] };

		if ( themeDuotones && themeDuotones.length ) {
			result.duotones.push( {
				name: _x(
					'Theme',
					'Indicates these duotone filters come from the theme.'
				),
				slug: 'theme',
				duotones: themeDuotones,
			} );
		}

		if (
			shouldDisplayDefaultDuotones &&
			defaultDuotones &&
			defaultDuotones.length
		) {
			result.duotones.push( {
				name: _x(
					'Default',
					'Indicates these duotone filters come from WordPress.'
				),
				slug: 'default',
				duotones: defaultDuotones,
			} );
		}
		if ( customDuotones && customDuotones.length ) {
			result.duotones.push( {
				name: _x(
					'Custom',
					'Indicates these doutone filters are created by the user.'
				),
				slug: 'custom',
				duotones: customDuotones,
			} );
		}

		return result;
	}, [
		colors,
		gradients,
		customDuotones,
		themeDuotones,
		defaultDuotones,
		shouldDisplayDefaultDuotones,
	] );

	return palettes;
}

/**
 * Get deduped examples for single page stylebook.
 * @param {Array} examples Array of examples.
 * @return {Array} Deduped examples.
 */
export function getExamplesForSinglePageUse( examples ) {
	const examplesForSinglePageUse = [];
	const overviewCategoryExamples = getExamplesByCategory(
		{ slug: 'overview' },
		examples
	);
	examplesForSinglePageUse.push( ...overviewCategoryExamples.examples );
	const otherExamples = examples.filter( ( example ) => {
		return (
			example.category !== 'overview' &&
			! overviewCategoryExamples.examples.find(
				( overviewExample ) => overviewExample.name === example.name
			)
		);
	} );
	examplesForSinglePageUse.push( ...otherExamples );

	return examplesForSinglePageUse;
}

function StyleBook( {
	enableResizing = true,
	isSelected,
	onClick,
	onSelect,
	showCloseButton = true,
	onClose,
	showTabs = true,
	userConfig = {},
	path = '',
} ) {
	const [ resizeObserver, sizes ] = useResizeObserver();
	const [ textColor ] = useGlobalStyle( 'color.text' );
	const [ backgroundColor ] = useGlobalStyle( 'color.background' );
	const colors = useMultiOriginPalettes();
	const examples = useMemo( () => getExamples( colors ), [ colors ] );
	const tabs = useMemo(
		() =>
			getTopLevelStyleBookCategories().filter( ( category ) =>
				examples.some(
					( example ) => example.category === category.slug
				)
			),
		[ examples ]
	);

	const examplesForSinglePageUse = getExamplesForSinglePageUse( examples );

	const { base: baseConfig } = useContext( GlobalStylesContext );
	const goTo = getStyleBookNavigationFromPath( path );

	const mergedConfig = useMemo( () => {
		if ( ! isObjectEmpty( userConfig ) && ! isObjectEmpty( baseConfig ) ) {
			return mergeBaseAndUserConfigs( baseConfig, userConfig );
		}
		return {};
	}, [ baseConfig, userConfig ] );

	// Copied from packages/edit-site/src/components/revisions/index.js
	// could we create a shared hook?
	const originalSettings = useSelect(
		( select ) => select( blockEditorStore ).getSettings(),
		[]
	);
	const [ globalStyles ] = useGlobalStylesOutputWithConfig( mergedConfig );

	const settings = useMemo(
		() => ( {
			...originalSettings,
			styles:
				! isObjectEmpty( globalStyles ) && ! isObjectEmpty( userConfig )
					? globalStyles
					: originalSettings.styles,
			isPreviewMode: true,
		} ),
		[ globalStyles, originalSettings, userConfig ]
	);

	return (
		<EditorCanvasContainer
			onClose={ onClose }
			enableResizing={ enableResizing }
			closeButtonLabel={ showCloseButton ? __( 'Close' ) : null }
		>
			<div
				className={ clsx( 'edit-site-style-book', {
					'is-wide': sizes.width > 600,
					'is-button': !! onClick,
				} ) }
				style={ {
					color: textColor,
					background: backgroundColor,
				} }
			>
				{ resizeObserver }
				{ showTabs ? (
					<Tabs>
						<div className="edit-site-style-book__tablist-container">
							<Tabs.TabList>
								{ tabs.map( ( tab ) => (
									<Tabs.Tab
										tabId={ tab.slug }
										key={ tab.slug }
									>
										{ tab.title }
									</Tabs.Tab>
								) ) }
							</Tabs.TabList>
						</div>
						{ tabs.map( ( tab ) => (
							<Tabs.TabPanel
								key={ tab.slug }
								tabId={ tab.slug }
								focusable={ false }
								className="edit-site-style-book__tabpanel"
							>
								<StyleBookBody
									category={ tab.slug }
									examples={ examples }
									isSelected={ isSelected }
									onSelect={ onSelect }
									settings={ settings }
									sizes={ sizes }
									title={ tab.title }
									goTo={ goTo }
								/>
							</Tabs.TabPanel>
						) ) }
					</Tabs>
				) : (
					<StyleBookBody
						examples={ examplesForSinglePageUse }
						isSelected={ isSelected }
						onClick={ onClick }
						onSelect={ onSelect }
						settings={ settings }
						sizes={ sizes }
						goTo={ goTo }
					/>
				) }
			</div>
		</EditorCanvasContainer>
	);
}

/**
 * Style Book Preview component renders the stylebook without the Editor dependency.
 *
 * @param {Object}   props            Component props.
 * @param {string}   props.path       Path to the selected block.
 * @param {Object}   props.userConfig User configuration.
 * @param {Function} props.isSelected Function to check if a block is selected.
 * @param {Function} props.onSelect   Function to select a block.
 * @return {Object} Style Book Preview component.
 */
export const StyleBookPreview = ( {
	path = '',
	userConfig = {},
	isSelected,
	onSelect,
} ) => {
	const siteEditorSettings = useSelect(
		( select ) => select( siteEditorStore ).getSettings(),
		[]
	);
	// Update block editor settings because useMultipleOriginColorsAndGradients fetch colours from there.
	dispatch( blockEditorStore ).updateSettings( siteEditorSettings );

	const [ resizeObserver, sizes ] = useResizeObserver();
	const colors = useMultiOriginPalettes();
	const examples = getExamples( colors );
	const examplesForSinglePageUse = getExamplesForSinglePageUse( examples );

	const { base: baseConfig } = useContext( GlobalStylesContext );
	const goTo = getStyleBookNavigationFromPath( path );

	const mergedConfig = useMemo( () => {
		if ( ! isObjectEmpty( userConfig ) && ! isObjectEmpty( baseConfig ) ) {
			return mergeBaseAndUserConfigs( baseConfig, userConfig );
		}
		return {};
	}, [ baseConfig, userConfig ] );

	const [ globalStyles ] = useGlobalStylesOutputWithConfig( mergedConfig );

	const settings = useMemo(
		() => ( {
			...siteEditorSettings,
			styles:
				! isObjectEmpty( globalStyles ) && ! isObjectEmpty( userConfig )
					? globalStyles
					: siteEditorSettings.styles,
			isPreviewMode: true,
		} ),
		[ globalStyles, siteEditorSettings, userConfig ]
	);

	return (
		<div className="edit-site-style-book">
			{ resizeObserver }
			<BlockEditorProvider settings={ settings }>
				<StyleBookBody
					examples={ examplesForSinglePageUse }
					settings={ settings }
					goTo={ goTo }
					sizes={ sizes }
					isSelected={ isSelected }
					onSelect={ onSelect }
				/>
			</BlockEditorProvider>
		</div>
	);
};

export const StyleBookBody = ( {
	category,
	examples,
	isSelected,
	onClick,
	onSelect,
	settings,
	sizes,
	title,
	goTo,
} ) => {
	const [ isFocused, setIsFocused ] = useState( false );
	const [ hasIframeLoaded, setHasIframeLoaded ] = useState( false );
	const iframeRef = useRef( null );
	// The presence of an `onClick` prop indicates that the Style Book is being used as a button.
	// In this case, add additional props to the iframe to make it behave like a button.
	const buttonModeProps = {
		role: 'button',
		onFocus: () => setIsFocused( true ),
		onBlur: () => setIsFocused( false ),
		onKeyDown: ( event ) => {
			if ( event.defaultPrevented ) {
				return;
			}
			const { keyCode } = event;
			if ( onClick && ( keyCode === ENTER || keyCode === SPACE ) ) {
				event.preventDefault();
				onClick( event );
			}
		},
		onClick: ( event ) => {
			if ( event.defaultPrevented ) {
				return;
			}
			if ( onClick ) {
				event.preventDefault();
				onClick( event );
			}
		},
		readonly: true,
	};

	const handleLoad = () => setHasIframeLoaded( true );
	useLayoutEffect( () => {
		if ( hasIframeLoaded && iframeRef?.current ) {
			if ( goTo?.top ) {
				scrollToSection( 'top', iframeRef?.current );
				return;
			}
			if ( goTo?.block ) {
				scrollToSection(
					`example-${ goTo?.block }`,
					iframeRef?.current
				);
			}
		}
	}, [ iframeRef?.current, goTo, scrollToSection, hasIframeLoaded ] );

	return (
		<Iframe
			onLoad={ handleLoad }
			ref={ iframeRef }
			className={ clsx( 'edit-site-style-book__iframe', {
				'is-focused': isFocused && !! onClick,
				'is-button': !! onClick,
			} ) }
			name="style-book-canvas"
			tabIndex={ 0 }
			{ ...( onClick ? buttonModeProps : {} ) }
		>
			<EditorStyles styles={ settings.styles } />
			<style>
				{ STYLE_BOOK_IFRAME_STYLES }
				{ !! onClick &&
					'body { cursor: pointer; } body * { pointer-events: none; }' }
			</style>
			<Examples
				className={ clsx( 'edit-site-style-book__examples', {
					'is-wide': sizes.width > 600,
				} ) }
				examples={ examples }
				category={ category }
				label={
					title
						? sprintf(
								// translators: %s: Category of blocks, e.g. Text.
								__( 'Examples of blocks in the %s category' ),
								title
						  )
						: __( 'Examples of blocks' )
				}
				isSelected={ isSelected }
				onSelect={ onSelect }
				key={ category }
			/>
		</Iframe>
	);
};

const Examples = memo(
	( { className, examples, category, label, isSelected, onSelect } ) => {
		const categoryDefinition = category
			? getTopLevelStyleBookCategories().find(
					( _category ) => _category.slug === category
			  )
			: null;

		const filteredExamples = categoryDefinition
			? getExamplesByCategory( categoryDefinition, examples )
			: { examples };

		return (
			<Composite
				orientation="vertical"
				className={ className }
				aria-label={ label }
				role="grid"
			>
				{ !! filteredExamples?.examples?.length &&
					filteredExamples.examples.map( ( example ) => (
						<Example
							key={ example.name }
							id={ `example-${ example.name }` }
							title={ example.title }
							content={ example.content }
							blocks={ example.blocks }
							isSelected={ isSelected?.( example.name ) }
							onClick={
								!! onSelect
									? () => onSelect( example.name )
									: null
							}
						/>
					) ) }
				{ !! filteredExamples?.subcategories?.length &&
					filteredExamples.subcategories.map( ( subcategory ) => (
						<Composite.Group
							className="edit-site-style-book__subcategory"
							key={ `subcategory-${ subcategory.slug }` }
						>
							<Composite.GroupLabel>
								<h2 className="edit-site-style-book__subcategory-title">
									{ subcategory.title }
								</h2>
							</Composite.GroupLabel>
							<Subcategory
								examples={ subcategory.examples }
								isSelected={ isSelected }
								onSelect={ onSelect }
							/>
						</Composite.Group>
					) ) }
			</Composite>
		);
	}
);

const Subcategory = ( { examples, isSelected, onSelect } ) => {
	return (
		!! examples?.length &&
		examples.map( ( example ) => (
			<Example
				key={ example.name }
				id={ `example-${ example.name }` }
				title={ example.title }
				content={ example.content }
				blocks={ example.blocks }
				isSelected={ isSelected?.( example.name ) }
				onClick={ !! onSelect ? () => onSelect( example.name ) : null }
			/>
		) )
	);
};

const disabledExamples = [ 'example-duotones' ];

const Example = ( { id, title, blocks, isSelected, onClick, content } ) => {
	const originalSettings = useSelect(
		( select ) => select( blockEditorStore ).getSettings(),
		[]
	);
	const settings = useMemo(
		() => ( {
			...originalSettings,
			focusMode: false, // Disable "Spotlight mode".
			isPreviewMode: true,
		} ),
		[ originalSettings ]
	);

	// Cache the list of blocks to avoid additional processing when the component is re-rendered.
	const renderedBlocks = useMemo(
		() => ( Array.isArray( blocks ) ? blocks : [ blocks ] ),
		[ blocks ]
	);

	const disabledProps =
		disabledExamples.includes( id ) || ! onClick
			? {
					disabled: true,
					accessibleWhenDisabled: !! onClick,
			  }
			: {};

	return (
		<div role="row">
			<div role="gridcell">
				<Composite.Item
					className={ clsx( 'edit-site-style-book__example', {
						'is-selected': isSelected,
						'is-disabled-example': !! disabledProps?.disabled,
					} ) }
					id={ id }
					aria-label={
						!! onClick
							? sprintf(
									// translators: %s: Title of a block, e.g. Heading.
									__( 'Open %s styles in Styles panel' ),
									title
							  )
							: undefined
					}
					render={ <div /> }
					role={ !! onClick ? 'button' : null }
					onClick={ onClick }
					{ ...disabledProps }
				>
					<span className="edit-site-style-book__example-title">
						{ title }
					</span>
					<div
						className="edit-site-style-book__example-preview"
						aria-hidden
					>
						<Disabled className="edit-site-style-book__example-preview__content">
							{ content ? (
								content
							) : (
								<ExperimentalBlockEditorProvider
									value={ renderedBlocks }
									settings={ settings }
								>
									<EditorStyles />
									<BlockList renderAppender={ false } />
								</ExperimentalBlockEditorProvider>
							) }
						</Disabled>
					</div>
				</Composite.Item>
			</div>
		</div>
	);
};

export default StyleBook;
