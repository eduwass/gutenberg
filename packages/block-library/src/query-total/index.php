<?php
/**
 * Server-side rendering of the `core/query-total` block.
 *
 * @package WordPress
 */

/**
 * Renders the `query-total` block on the server.
 *
 * @since 6.8.0
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Block default content.
 * @param WP_Block $block      Block instance.
 *
 * @return string The rendered block content.
 */
function render_block_core_query_total( $attributes, $content, $block ) {
	global $wp_query;
	$wrapper_attributes = get_block_wrapper_attributes();
	if ( isset( $block->context['query']['inherit'] ) && $block->context['query']['inherit'] ) {
		$query_to_use = $wp_query;
		$current_page = max( 1, get_query_var( 'paged', 1 ) );
	} else {
		$page_key     = isset( $block->context['queryId'] ) ? 'query-' . $block->context['queryId'] . '-page' : 'query-page';
		$current_page = isset( $_GET[ $page_key ] ) ? (int) $_GET[ $page_key ] : 1;
		$query_to_use = new WP_Query( build_query_vars_from_query_block( $block, $current_page ) );
	}

	$max_rows       = $query_to_use->found_posts;
	$posts_per_page = $query_to_use->get( 'posts_per_page' );

	// Calculate the range of posts being displayed.
	$start = ( $current_page - 1 ) * $posts_per_page + 1;
	$end   = min( $start + $posts_per_page - 1, $max_rows );

	// Prepare the display based on the `displayType` attribute.
	$output = '';
	switch ( $attributes['displayType'] ) {
		case 'range-display':
			if ( $start === $end ) {
				$range_text = sprintf(
					/* translators: 1: Start index of posts, 2: Total number of posts */
					__( 'Displaying %1$s of %2$s' ),
					'<strong>' . $start . '</strong>',
					'<strong>' . $max_rows . '</strong>'
				);
			} else {
				$range_text = sprintf(
					/* translators: 1: Start index of posts, 2: End index of posts, 3: Total number of posts */
					__( 'Displaying %1$s – %2$s of %3$s' ),
					'<strong>' . $start . '</strong>',
					'<strong>' . $end . '</strong>',
					'<strong>' . $max_rows . '</strong>'
				);
			}

			$output = sprintf( '<p>%s</p>', $range_text );
			break;

		case 'total-results':
		default:
			$output = sprintf(
				'<p><strong>%d</strong> %s</p>',
				$max_rows,
				_n( 'result found', 'results found', $max_rows )
			);
			break;
	}

	return sprintf(
		'<div %1$s>%2$s</div>',
		$wrapper_attributes,
		$output
	);
}

/**
 * Registers the `query-total` block.
 *
 * @since 6.8.0
 */
function register_block_core_query_total() {
	register_block_type_from_metadata(
		__DIR__ . '/query-total',
		array(
			'render_callback' => 'render_block_core_query_total',
		)
	);
}
add_action( 'init', 'register_block_core_query_total' );
