/*  eval.c  expression evaluator - Stellingwerf  */
/*  $Id$  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*--------------------------------------------------------------------------
    OPERATIONS   + - * / ^ %  & | > < = ~ (not) are supported
        % is frac(x/y)*y - same as C for ints, but does reals, too
        Boolean ops are defined on floats with false = 0, true != 0
        supports ten levels of parentheses, 50 levels of recursion
    Operation Heirarchy:  un - ~ then ^ % then * / then + - then > < = then & |
        Higher ops done first, equal ops are done left to right
        Parens should be used in complex cases, will override hierarchy
        Use DEBUG to see how the terms are grouped for evaluation
-----------------------------------------------------------------------------
    USER VARIABLES: any variable name staring with an upper case letter
        Must be defined with a Uvar = # command (value can be changed)
        Then can be used in expressions.
    USER FUNCTIONS: are defined using the "function" command
    CONSTANTS supported:  ee(=e), pi, rad, ran, ran2, rang, ranw, eof
    FUNCTIONS supported:  abs(), sq(), sqrt, cub(), cbrt(), seed(),
        sin(), cos(), tan(), asin(), acos(), atan(), int(), ip(), fp(),
        log(), ln(), exp(), exp10(), lmin( , , ...), lmax( , ,...)
		fact(), floor(), ceil()

    ran (no parens) returns a random number between 0 and 1
    ran2  returns a random number between -1 and 1
    rang  returns a Gaussian random number, mean 0, sd 1
    ranw returns a Weibull dist random number with low=0, center=1, m=3, n=1
        use set_weib command to reset params
    seed(x) - sets the seed of the rans as "x"
    rad = pi / 180 = radians/degree (for trig functions)
    int(x) = nearest integer to x
    ip(x) = truncated integer part of x
    fp(x) = x - ip(x) = fractional part of x. <0 if x<0
    function arguments may be other functions, expressions,
        etc., they must evaluate eventually to a number

    if test:  if(exp0,exp1,exp2,exp3)    where exp=expression...or *
        test is on exp0, returns exp1,2,3 if <,=,> 0
        if(exp0,exp1,*,exp3) = if(exp0,exp1,exp1,exp3)   ie does <= 0
        if(exp0,exp1,exp2,*) = if(exp0,exp1,exp2,exp2)   ie does >= 0
-----------------------------------------------------------------------------
    DEBUG EXPRESSION:  any expression ending with '!' gives complete trace 
------------------------------------------------------------------------------
    expressions may start with '-' or '.' Blanks are ok, but not needed.
-------------------------------------------------------------------------*/

/*--------------------------------------------------------
===public functions====
exptof() - expression to float 
    calls parenthesize(), parse_expression()
register_user_var() - track user vars
lookup_user_var() - get user value

====private functions  ====
parse_expression() - recursive exp parser
    calls parse_expression(), parse_function().
    advance()
indt() - indent debug output
parenthesize() - add parens to do binding

parse_function() - evaluate functions
    calls - parse_expression(), do_if(),
    do_lmin(), do_lmax()
advance() - move pointer through string
insert_char() - utility
fix_list_fn() - utility
do_if() - if test
do_lmax() - max fn
do_lmin() - lmin fn
logc(), sqrtc(), exp10() - math functions
ran_gauss(),  ran_weibull()

----------------------------------------------------------*/

#define EXTERN extern
#include "s_tran.h"

/*=========================headers======================*/

/*  private functions  */
static double parse_expression( char *str );
static void indt( void );
static void parenthesize( char * str );    
static double parse_function( char *str );
static int fix_list_fn( char *str );
static void insert_char( char *str, char c, int n );
static double do_if( char *str );
static char *advance( char *str );
static double rangauss( void );
static double rand_weibull( double lower, double center, double n, double m );
static double sqrc( double x );
static double exp10( double x );
static double do_lmin( char *str );
static double do_lmax( char *str );
static double lookup_user_fn( char *name, char *str, int exp_pos );
static int is_nm( char cc );
static int string_to_num( char *str );

/*  share this one  */
double bspl3( double z );

static int paren_level, recur_level, evdebug, fn_level, fn_eval;

#define MAX_VARS   1000000     /* x100 for 64 bit version   */
#define MAX_FNS       100
#define LAB_LEN        25
#define MAX_STRINGS 20000

struct user_var {
    char name[LAB_LEN+1];
    char file[256];
    char routine[126];
    int len;
    double val;
    int level;
    int str_num;
	int constant;
};

struct user_fn {
    char name[LAB_LEN+1];
    int num_args;
    char arg[MAX_ARGS+1][LAB_LEN+1];
    char exp[STRING_LEN+1];
};

char strings[MAX_STRINGS+1][STRING_LEN+1];

static struct user_var uvar[MAX_VARS+1];
static struct user_fn ufn[MAX_FNS+1];

static int Uvar, Num_vars, Num_strings, Num_fns, Fn_len;

/*==============loop indices from parse============================*/

extern double gloop_i_index, gloop_j_index, gloop_k_index;
extern int gloop_active, debug, g_level, end_of_file, query_result, data_error;

/*===========function identifiers========================================*/

char g_file[256], g_routine[126];

/*  Weibull defaults  */
double w_low = 0., w_cent = 1., w_n = 1., w_m = 3.;


/*------------ parse, evaluate, and reformat formula field -----------------*/
/*             returns integer value                                    */

int exptoi( char *instring )
{
    return( (int)floor( exptof( instring ) + 0.5 ) );
}


/*------------ parse, evaluate, and reformat formula field -----------------*/
/*             returns double value                                    */

double exptof( char *instring )
{
    double current_num;
    char pf_buf[256];
    int slen;
                                                /*  use local str copy  */
    strncpy( pf_buf, instring, 256 );
												/*  missing data  */
	if( pf_buf[0] == '\0' )   return ( MISSING );

                                                /*  debug expression  */
    slen = strlen( pf_buf );
    if( pf_buf[slen-1] == '!' ) {
        evdebug = 1;
        pf_buf[slen-1] = '\0';
    }
    if( evdebug )  {indt(); printf( "pf: %s\n", pf_buf );}

                                                /*  add parens if needed  */
    parenthesize( pf_buf ); 

    if( !fn_eval ) {
        paren_level = 0;
        recur_level = 0;
    }
                                                /*  do it  */
    current_num = parse_expression( pf_buf );

                                                /*  error, quit or return 0  */
                                                /*  (test on err if needed)  */
    if( current_num == ERR_VAL )  return(0.);

                                                /*  check parens  */
    if( paren_level && !fn_eval ) {
        sprintf( stmp, "pf: illegal formula, check parens: %s, plev=%d", pf_buf, paren_level );
        do_error( stmp );
        return(ERR_VAL);
    }

    if( !fn_eval )  evdebug = 0;
    return( current_num );
}


/*------------ parse, evaluate expression field recursively --------------*/
/*             call through exptof ONLY    */

double parse_expression( char *instring )
{
    char *current_ptr, current_char, *ptr;
    double current_num=0, next_num, tmp;
    char pending_op=0;
    int i, go=1;

    recur_level++;

    if( evdebug )  {indt(); printf( "pe: %s  plev=%d, lev=%d\n", instring, paren_level, recur_level ); }

                                                /*  error tests  */
    if( recur_level > 50 ) {
        recur_level--;
        printf( "pe: recursion level > 50, aborted: %s\n", instring );
        return( ERR_VAL );
    }
    if( paren_level > 10 ) {
        paren_level--;
        printf( "pe:  too many parens, aborted: %s\n", instring );
        return( ERR_VAL );
    }
                                                /*  first num = 0  */
    current_ptr = instring;
    current_char = *current_ptr;
	
//printf( "curr_char=%c\n", current_char );	                                             /*  skip blanks     */
	while( current_char == ' ' ) {
		current_ptr++;
		current_char = *current_ptr;
	}
	                                              /*  set first op  */
	                                              /*  unary operations handled here  */
    if( current_char == '-' ) {
        pending_op = '-';
        current_ptr++;
        current_char = *current_ptr;
    }
    else if( current_char == '+' ) {
        pending_op = '+';
        current_ptr++;
        current_char = *current_ptr;
    }
    else if( current_char == '~' ) {
        pending_op = '~';
        current_ptr++;
        current_char = *current_ptr;
        current_num = 1;
//printf( "found a squig  nxt char=%c\n", current_char );
    }
    else pending_op = '+';
                                                /*  operation loop  */
    while( go ) {
                                                /*  skip blanks     */
        while( current_char == ' ' ) {
            current_ptr++;
            current_char = *current_ptr;
        }
                                                /*  detect formula end  */
        if( current_char == '\0' )  break;
        if( current_char == ';' )  break;
        if( current_char == ',' )  break;
        if( current_char == '#' )  break;
        if( current_char == '!' )  break;
        if( current_char == ')' ) {
            paren_level--;
            break;
        }
                                                /*  recursion here  */
        if( current_char == '(' ) {
            paren_level++;
            next_num = parse_expression( current_ptr+1 );
            if( next_num == ERR_VAL )  return(ERR_VAL);
        }
		                                        /*  get date  */
		else if( current_char == '$' && *(current_ptr+1) == 'd' && *(current_ptr+2) == 'a' && *(current_ptr+3) == 't' && *(current_ptr+4) == 'e' ) {
			strcpy( gstring, ascdate() );
			return( 1 );
		}
		                                        /*  convert string  */
		else if( current_char == '\"' ) {
			for( ptr = current_ptr+1, i = 0; *ptr != '\"'; ptr++, i++ )  gstring[i] = *ptr;
			gstring[i] = '\0';
			next_num = string_to_num( gstring );
			current_ptr = ptr+1;
            //printf( "string convert:  %s  %g\n", gstring, next_num );
		}
                                                /*  get function  */

        else if( current_char >= 'a' && current_char <= 'z' ) {
            next_num = parse_function( current_ptr );
            if( next_num == ERR_VAL )  return(ERR_VAL);
            if( evdebug )  {indt(); printf( "fn: %g\n", next_num );}
        }
		
                                                /*  get user var  */

        else if( (current_char >= 'A' && current_char <= 'Z') || current_char == '$' ) {
            next_num = lookup_user_var( current_ptr );
            if( next_num == ERR_VAL )  return(ERR_VAL);
            if( evdebug )  {indt(); printf( "uvar: %g\n", next_num );}
        }
                                                /*  get number  */

        else if( (current_char >= '0' && current_char <= '9') || current_char == '.' ) {
            next_num = atof( current_ptr );
        }
        else {
            sprintf( stmp, "eval: illegal formula: %s, unknown char: (%c)(%x)", instring, current_char, current_char );
            do_error( stmp );
            return(ERR_VAL);
        }
                                                /*  move pointer  */

        current_ptr = advance( current_ptr );

        if( !current_ptr ) {
            sprintf( stmp, "pe: illegal formula, check parens: %s", instring );
            do_error( stmp );
            return(ERR_VAL);
        }
        tmp = current_num;
        if( evdebug && tmp )  {indt(); printf( "op: %g %c %g =", current_num, pending_op, next_num );}

                                                /*  apply op  */
        switch( pending_op ) { 

            case '+':
            current_num += next_num;
            break;

            case '-':
            current_num -= next_num;
            break;

            case '~':
            current_num = current_num && !next_num;
            break;

            case '*':
            current_num *= next_num;
            break;

            case '/':
			if( next_num == 0. )  do_error( "Eval: Zero divide encountered, run debug to locate" );
            current_num /= next_num;
            break;

            case '^':
            current_num = pow( current_num, next_num );
            break;

            /*  version 1.38 - now defined for general reals, not just ints  */
            case '%':
            current_num = ((current_num / next_num) - floor(current_num / next_num)) * next_num;
            break;

            case '<': {
                if( current_num < next_num)  current_num = 1.;
                else                         current_num = 0.;
            }
            break;

            case '>': {
                if( current_num > next_num)  current_num = 1.;
                else                         current_num = 0.;
            }
            break;

            case '=': {
                if( current_num == next_num)  current_num = 1.;
                else                          current_num = 0.;
            }
            break;

            case '&': {
                if( (current_num != 0.) && (next_num != 0.) )  current_num = 1.;
                else                                           current_num = 0.;
            }
            break;

            case '|': {
                if( (current_num != 0.) || (next_num != 0.) )  current_num = 1.;
                else                                           current_num = 0.;
            }
            break;

            default:
            printf( "ss: unknown op = Fc in %s, expr=%s\n", pending_op, current_ptr, instring );
            do_exit(0);
            return(ERR_VAL);
        }
        current_char = *current_ptr;

        if( evdebug && tmp )  printf( " %g\n", current_num );

                                                /*  exit conditions  */
        if( current_char == '\0' )  break;
        if( current_char == ',' )  break;
        if( current_char == '!' )  break;
        if( current_char == ')' ) {
            paren_level--;
            break;
        }
                                                /*  skip spaces  */
        while( current_char == ' ' ) {
            current_ptr++;
            current_char = *current_ptr;
        }
                                                /*  check for next op  */

        if( current_char == '+' || current_char == '-' || current_char == '*' || current_char == '/' || 
            current_char == '^' || current_char == '%' || current_char == '<' || current_char == '>' ||
            current_char == '=' || current_char == '&' || current_char == '|' || current_char == '~' ) {

            pending_op = current_char;
            current_ptr++;
            current_char = *current_ptr;
        }
    }
    recur_level--;
    if( evdebug ) {
        {indt(); printf( "<--pe: plev=%d lev=%d\n", paren_level, recur_level ); }
        if( !recur_level )  evdebug = 0;
    }

    return( current_num );
}


/*---------------------- indent to show recursion level ---------------*/
void indt( void )
{
    int i;

    for( i = 1; i <= recur_level; i++ ) {
        printf( "   " );
    }
}


/*---------------------------------  do op bindings via parens  */

void parenthesize( char *str )    
{
    int i, j, insert, paren, brack, quoted = 0;

                                               /*  do "e" notation - note start with second character */
    if( str[0] == '\"' )  quoted = 1;
    for( i = 1; str[i] != '\0'; i++ ) {
		/*  handle quoted strings  */
		if( str[i] == '\"' ) {
			quoted = !quoted;
			continue;
		}
		if( quoted )  continue;

		if( (isdigit( str[i-1]) || str[i-1] == '.') && (str[i] == 'e' || str[i] == 'E') && (str[i+1] == '(') )  do_error( "Parens in e notation not allowed, use exp10()" );
        if( (isdigit( str[i-1]) || str[i-1] == '.') && (str[i] == 'e' || str[i] == 'E') && (isdigit( str[i+1]) || str[i+1] == '+' || str[i+1] == '-') ) {

                                                /*  back scan  */
            insert = 0;
            paren = 0;
			quoted = 0;
            for( j = i-1; j >= 0; j-- ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if( !j ) {
                    insert_char( str, '(', 0 );
                    i++;
                    insert = 1;
                    break;
                }
                if( str[j] == ',' ) {
                    if( !paren ) break;
                }
                if( str[j] == '(' ) {
                    if( !paren )  break;
                    paren--;
                }
                if(  str[j] == ')' ) {
                    paren++;
                }
                if( paren )  continue; 
                if( str[j] == '+' || str[j] == '-' || str[j] == '*' || str[j] == '/' ||
                    str[j] == '~' || str[j] == '<' || str[j] == '>' || str[j] == '=' ||
                    str[j] == '&' || str[j] == '|' || str[j] == '%' || str[j] == '^' ) {
                    insert_char( str, '(', j+1 );
                    i++;
                    insert = 1;
                    break;
                }
            }
            if( !insert )  continue;
                                                /*  forward scan  */
            paren = 0;
			quoted = 0;
            for( j = i+2; str[j] != '\0'; j++ ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if(  str[j] == '(' ) {
                    paren++;
                }
                if(  str[j] == ')' ) {
                    if( !paren ) {
                        insert_char( str, ')', j );
                        i = j+1;
                        break;
                    }
                    paren--;
                }
                if( paren )  continue;
                if( str[j] == ',' || str[j] == '+' || str[j] == '-' || str[j] == '~' ||
                    str[j] == '*' || str[j] == '/' || str[j] == '<' || str[j] == '>' ||
                    str[j] == '=' || str[j] == '&' || str[j] == '|' || str[j] == '%' ||
                    str[j] == '^' ) {
                    insert_char( str, ')', j );
                    i = j+1;
                    break;
                }
            }
            if( str[j] == '\0' ) {
                insert_char( str, ')', j );
                i++;
            }
        }
    }

                                                /*  do unary bindings */
	quoted = 0;
    for( i = 0; str[i+1] != '\0'; i++ ) {
		/*  handle quoted strings  */
		if( str[i] == '\"' ) {
			quoted = !quoted;
			continue;
		}
		if( quoted )  continue;

        if( (str[i] == '(' || str[i] == '%' || str[i] == '^' || str[i] == ',' ||
             str[i] == '+' || str[i] == '-' || str[i] == '~' || str[i] == '*' || 
             str[i] == '/' || str[i] == '<' || str[i] == '>' || str[i] == '=' ||
             str[i] == '&' || str[i] == '|' ) 
             && (str[i+1] == '-' || str[i+1] == '+' || str[i+1] == '~') ) {
 
            insert_char( str, '(', i+1 );
            i++;
                                                /*  forward scan  */
            paren = 0;
			quoted = 0;
            for( j = i+2; str[j] != '\0'; j++ ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if(  str[j] == '(' ) {
                    paren++;
                }
                if(  str[j] == ')' ) {
                    if( !paren ) {
                        insert_char( str, ')', j );
                        i = j+1;
                        break;
                    }
                    paren--;
                }
                if( paren )  continue;

                if( j > 1 && isdigit( str[j-2]) && (str[j-1] == 'e' || str[j-1] == 'E') && (str[j] == '+' || str[j] == '-') ) {
                    continue;
                }
                if( str[j] == '%' || str[j] == '^' || str[j] == ',' || str[j] == '+' ||
                    str[j] == '-' || str[j] == '~' || str[j] == '*' || str[j] == '/' ||
                    str[j] == '<' || str[j] == '>' || str[j] == '=' || str[j] == '&' ||
                    str[j] == '|' ) {
                    insert_char( str, ')', j );
                    i = j+1;
                    break;
                }
            }
            if( str[j] == '\0' ) {
                insert_char( str, ')', j );
                i++;
			}
        }
    }

                                                /*  scan for ^ or %  */
	quoted = 0;
    for( i = 0; str[i] != '\0'; i++ ) {
		/*  handle quoted strings  */
		if( str[i] == '\"' ) {
			quoted = !quoted;
			continue;
		}
		if( quoted )  continue;
        if( str[i] == '^' || str[i] == '%' ) {
                                                /*  back scan  */
            insert = 0;
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i-1; j > 0; j-- ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if( str[j] == ',' ) {
                    if( !paren ) break;
                }
                if( str[j] == '(' ) {
                    if( !paren )  break;
                    paren--;
                } 
                if(  str[j] == ')' ) {
                    paren++;
                }
                if( paren )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;
                if( str[j] == '+' || str[j] == '-' || str[j] == '*' || str[j] == '/' ||
                    str[j] == '~' || str[j] == '<' || str[j] == '>' || str[j] == '=' ||
                    str[j] == '&' || str[j] == '|' ) {
                    insert_char( str, '(', j+1 );
                    i++;
                    insert = 1;
                    break;
                }
            }
            if( !insert )  continue;
                                                /*  forward scan  */
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i+1; str[j] != '\0'; j++ ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if(  str[j] == '(' ) {
                    paren++;
                }
                if(  str[j] == ')' ) {
                    if( !paren ) {
                        insert_char( str, ')', j );
                        i = j+1;
                        break;
                    }
                    paren--;
                }
                if( paren && paren != -1 )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;
                if( str[j] == ',' || str[j] == '+' || str[j] == '-' || str[j] == '~' ||
                    str[j] == '*' || str[j] == '/' || str[j] == '<' || str[j] == '>' ||
                    str[j] == '=' || str[j] == '&' || str[j] == '|' || str[j] == ')' ) {
                    insert_char( str, ')', j );
                    i = j+1;
                    break;
                }
            }
            if( str[j] == '\0' ) {
                insert_char( str, ')', j );
                i++;
            }
        }
    }

                                                /*  scan for *,/  */
	quoted = 0;
    for( i = 0; str[i] != '\0'; i++ ) {
		/*  handle quoted strings  */
		if( str[i] == '\"' ) {
			quoted = !quoted;
			continue;
		}
		if( quoted )  continue;

        if( str[i] == '*' || str[i] == '/' ) {
                                                /*  back scan  */
            insert = 0;
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i-1; j >= 0; j-- ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if( str[j] == ',' ) {
                    if( !paren ) break;
                }
                if( str[j] == '(' ) {
                    if( !paren )  break;
                    paren--;
                }
                if(  str[j] == ')' ) {
                    paren++;
                }
                if( paren )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;

                if( str[j] == '+' || str[j] == '-' || str[j] == '~' ||
                    str[j] == '<' || str[j] == '>' || str[j] == '=' || str[j] == '&' ||
                    str[j] == '|' ) {
                    insert_char( str, '(', j+1 );
                    i++;
                    insert = 1;
                    break;

                }
            }
            if( !insert )  continue;
                                                /*  forward scan  */
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i+1; str[j] != '\0'; j++ ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if(  str[j] == '(' ) {
                    paren++;
                }
                if(  str[j] == ')' ) {
                    if( !paren ) {
                        insert_char( str, ')', j );
                        i++;
                        break;
                    }
                    paren--;
                }
                if( paren )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;
                if( str[j] == '+' || str[j] == '-' || str[j] == '~' || str[j] == ',' ||
                    str[j] == '<' || str[j] == '>' || str[j] == '=' || str[j] == '&' ||
                    str[j] == '|' ) {
                    insert_char( str, ')', j );
                    i = j+1;
                    break;
                }
            }
            if( str[j] == '\0' ) {
                insert_char( str, ')', j );
                i = j+1;
            }
        }
    }
                                                /*  scan for +,-  */
	quoted = 0;
    for( i = 0; str[i] != '\0'; i++ ) {
		/*  handle quoted strings  */
		if( str[i] == '\"' ) {
			quoted = !quoted;
			continue;
		}
		if( quoted )  continue;

        if( str[i] == '+' || str[i] == '-' ) {
                                                /*  back scan  */
            insert = 0;
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i-1; j >= 0; j-- ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if( str[j] == ',' ) {
                    if( !paren ) break;
                }
                if( str[j] == '(' ) {
                    if( !paren )  break;
                    paren--;
                }
                if(  str[j] == ')' ) {
                    paren++;
                }
                if( paren )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;
                if( str[j] == '<' || str[j] == '>' || str[j] == '=' || str[j] == '&' ||
                    str[j] == '|' || str[j] == '~' ) {
                    insert_char( str, '(', j+1 );
                    i++;
                    insert = 1;
                    break;
                }
            }
            if( !insert )  continue;
                                                /*  forward scan  */
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i+1; str[j] != '\0'; j++ ) {
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if(  str[j] == '(' ) {
                    paren++;
                }
                if(  str[j] == ')' ) {
                    if( !paren ) {
                        insert_char( str, ')', j );
                        i = j+1;
                        break;
                    }
                    paren--;
                }
                if( paren )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;
                if(  str[j] == ',' || str[j] == '<' || str[j] == '>' || str[j] == '=' ||
                    str[j] == '&' || str[j] == '|' || str[j] == '~' ) {
                    insert_char( str, ')', j );
                    i = j+1;
                    break;
                }
            }
            if( str[j] == '\0' ) {
                insert_char( str, ')', j );
                i = j+1;
            }
        }
    }
                                                /*  scan for >,<,=  */
	quoted = 0;
    for( i = 0; str[i] != '\0'; i++ ) {
//printf( "strscan  char=%c, quoted=%d\n", str[i], quoted );
		/*  handle quoted strings  */
		if( str[i] == '\"' ) {
			quoted = !quoted;
			continue;
		}
		if( quoted )  continue;
        if( str[i] == '<' || str[i] == '>' || str[i] == '=') {

                                                /*  back scan  */
            insert = 0;
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i-1; j >= 0; j-- ) {
		//printf( "bscan char=%c, quote=%d\n", str[j], quoted );
				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;
				
                if( str[j] == ',' ) {
                    if( !paren ) break;
                }
                if( str[j] == '(' ) {
                    if( !paren )  break;
                    paren--;
                }
                if(  str[j] == ')' ) {
                    paren++;
                }
                if( paren )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;
                if(  str[j] == '&' || str[j] == '|' || str[j] == '~') {
		//printf( "    insert.(..\n" );
                    insert_char( str, '(', j+1 );
                    i++;
                    insert = 1;
                    break;
                }
            }
            if( !insert )  continue;
                                                /*  forward scan  */
            paren = 0;
            brack = 0;
			quoted = 0;
            for( j = i+1; str[j] != '\0'; j++ ) {
		//printf( "fscan char=%c, quote=%d\n", str[j], quoted );

				/*  handle quoted strings  */
				if( str[j] == '\"' ) {
					quoted = !quoted;
					continue;
				}
				if( quoted )  continue;

                if(  str[j] == '(' ) {
                    paren++;
                }
                if(  str[j] == ')' ) {
                    if( !paren ) {
                        insert_char( str, ')', j );
                        i = j+1;
                        break;
                    }
                    paren--;
                }
                if( paren )  continue;
                if(  str[j] == '[' ) {
                    brack++;
                }
                if(  str[j] == ']' ) {
                    brack--;
                }
                if( brack )  continue;
                if( str[j] == ',' || str[j] == '&' || str[j] == '|' || str[j] == '~' ) {
		//printf( "    insert.)..\n" );
                    insert_char( str, ')', j );
                    i = j+1;
                    break;
                }
            }
            if( str[j] == '\0' ) {
		//printf( "    eol insert.)..\n" );
                insert_char( str, ')', j );
                i++;
            }
        }
    }
}


/*-------check to see if a character is part of a name--------------*/

int is_nm( char cc )
{
    if( (cc > 'a' && cc < 'z') || (cc > 'A' && cc < 'Z') )   return( 1 );
    else if( cc > '0' && cc < '9' )  return( 1 );
    else if( cc == '$' || cc == '_' )  return( 1 );
    else return( 0 );
}


/*-------evaluate loop indices in a string--------------*/

void eval_indices( char *exp )
{
    int i, len;
    char stmp2[128], cc, cp, cn;
    double tmp;

    len = strlen( exp );

    /*  special case, no eval if index name  */
    if( len == 1 && (exp[0] == 'i' || exp[0] == 'j' || exp[0] == 'k' ) )  
            return;

    for(i = 0; i <= len - 1; i++ ) {
        cc = exp[i]; 
        if( cc == 'i' || cc == 'j' || cc == 'k' ) {
            if( i > 0 ) {
                cp = exp[i-1];
                if( is_nm( cp ) )  continue;
            }
            cn = exp[i+1];
            if( is_nm( cn ) )  continue;
            
            /*  index found, char i, now insert value  */
            if( cc == 'i' )  tmp = gloop_i_index;
            if( cc == 'j' )  tmp = gloop_j_index;
            if( cc == 'k' )  tmp = gloop_k_index;
            strcpy( stmp, exp );
            stmp[i] = '\0';
            strcpy( stmp2, exp+i+1 );
            sprintf( exp, "%s%g%s", stmp, tmp, stmp2 );
        }
    }
}


/*---------------------------------  user functions -------------------- */

int register_user_fn( char *buffer, char *exp )
{
    char name[LAB_LEN+1], arg[LAB_LEN+1];
    int i, j, i0, nfn;

    Num_fns++;
    nfn = Num_fns;
    if( Num_fns > MAX_FNS )  {
        printf( "error - too many user fnctions: %s\n", name );
        do_exit(2);
        return(0);
    }

    /*  check for loop indices  */
    if( gloop_active )  eval_indices( exp );


    /*  store function expression  */
    strcpy( ufn[nfn].exp, exp );

    /*  compute and store function name  */
    for( i = 0; i <= LAB_LEN; i++ ) {
        if( buffer[i] == '(' || buffer[i] == '\0' )  break;
        name[i] = buffer[i];
    }
    if( buffer[i] == '\0' ) {
        printf( "\nerror: incorrect function format: %s\n", buffer );
        do_exit(2);
        return(0);
    }
    name[i] = '\0';
    strcpy( ufn[nfn].name, name );

    /*  maintain value of i through this coding!!  */

    /*  check for duplicates  */
    for( j = 1; j <= Num_fns-1; j++ ) {
        if( !strcmp( ufn[j].name, name ) ) {
            printf( "\nerror:  duplicate function name: %s\n", name );
            do_exit(2);
            return(0);
        }
    }

    /*  special case = no args  */
    if( buffer[++i] == ')' ) {
        ufn[nfn].num_args = 0;
        return(1);
    }
 
    /*  compute and store args  */
    for( j = 1; j <= MAX_ARGS; j++, i++ ) {
        for( i0 = 0; i <= FIELD_LEN; i++, i0++ ) {
            if( buffer[i] == ',' || buffer[i] == ')' )  break;
            arg[i0] = buffer[i];
        }
        arg[i0] = '\0';
        if( arg[strlen(arg)-1] != '$' ) {
            printf( "\nerror: function argument must be a local variable: %s\n", buffer );
            do_exit(2);
            return(0);
        }
        strcpy( ufn[nfn].arg[j], arg );
        if( buffer[i] == ')' || buffer[i+1] == '\0' )  break;
    }
    ufn[nfn].num_args = j;

    if( debug )  printf( "Register fn %s, nargs=%d\n", ufn[nfn].name, j );

    return(1);
}


/*---------------------------------  user variables -------------------- */

int register_user_var( char *name, char *val, int init_only )
{
    int i;
    double old_val, val0;
                                                /*  check for var, most recent first  */
    if( Num_vars ) {
        for( i = Num_vars; i >= 1; i-- ) {

			/*  can be slow -- FIX!!!  */
            if( !strcmp( name, uvar[i].name ) ) {

                                               /*  local variables  */
                if( name[strlen(name)-1] == '$' ) {
                    if( uvar[i].level != g_level || strcmp( uvar[i].file, g_file ) || strcmp( uvar[i].routine, g_routine ) ) {
                        continue;
                    }
                }
                if( init_only )  return(0);

                Uvar = i;
				                               /*  const variables  */
				if( uvar[i].constant && uvar[i].val != exptof( val ))  {
					sprintf( stmp, "Attempt to change constant variable %s", name );
					do_error( stmp );
				}
				if( constant_value && !uvar[i].constant ) {
					printf( "WARNING: User variable %s has been reset to a constant\n", name );
                    uvar[i].constant = TRUE;
				}
                                               /*  string variables  */
                if( name[0] == '$' ) {
                    if( val[0] == '$' ) {
                        exptof( val );
                        strcpy( val, gstring );
                    }
                    if( !strcmp( val, strings[uvar[i].str_num] ) ) {
                        if( debug )  printf( "Redef..%s = %s, unchanged\n", name, strings[uvar[i].str_num] );
                        return(-1);
                    }
                    else {
                        strcpy( strings[uvar[i].str_num], val );
                        if( debug )  printf( "Redef..%s = %s\n", name, strings[uvar[i].str_num] );
                        return(0);
                    }
                }
                                              /*  real vars  */
                old_val = uvar[i].val;
                uvar[i].val = exptof( val );
                if( uvar[i].val != old_val ) {
                    if( debug )  printf( "Redef..%s = %g\n", name, uvar[i].val ); 
                    return(0);
                }
                else {
                    if( debug )  printf( "Redef..%s = %g, unchanged\n", name, uvar[i].val );
                    return(-1);
                }
            }
        }
    }
                                               /*  check for exp special case  */

    if( (name[strlen(name)-1] == 'e' || name[strlen(name)-1] == 'E') && isdigit( name[strlen(name)-2] ) ) {
        printf( "\nIllegal user variable name: cannot end with digit+'e'\n" );
        do_exit(2 );
        return(0);
    }
                                                /*  register a new one  */
    if( name[0] != '$' )  val0 = exptof( val );
    else                  val0 = 0.;


    Num_vars++;
    if( Num_vars > MAX_VARS )  {
        printf( "error - too many user variables: %s\n", name );
        do_exit(2);
        return(0);
    }
    strcpy( uvar[Num_vars].name, name );
    uvar[Num_vars].len = strlen( name );
    uvar[Num_vars].val = val0;
                                                /* local variable  */
    if( name[strlen(name)-1] == '$' ) {
        uvar[Num_vars].level = g_level;
        strcpy( uvar[Num_vars].file, g_file );
        strcpy( uvar[Num_vars].routine, g_routine );
        if( debug )  printf( "Local variable %d:%s (%s %s)\n", Num_vars, name, g_file, g_routine );
    }
	                                            /*  const variable  */
	if( constant_value )  uvar[Num_vars].constant = TRUE;

                                                /* string variable  */
    if( name[0] == '$' ) {
		if(  name[1] == 'd' && name[2] == 'a' && name[3] == 't' && name[4] == 'e' ) {
			do_error( "Illegal variable def: the string $date is a system constant");
		}
        Num_strings++;
        if( Num_strings > MAX_STRINGS )  {
            printf( "error - too many user strings: %s\n", name );
            do_exit(2);
            return(0);
        }
        uvar[Num_vars].str_num = Num_strings;
        if( val[0] == '$' ) {
            exptof( val );
            strcpy( val, gstring );
        }
        strcpy( strings[Num_strings], val );
        if( debug )  printf( "String variable: %d  %s = %s\n", Num_strings, name, strings[Num_strings] );
    }
                                              /*  float vars  */
    else if( debug )  printf( "User variable: %d  %s = %e\n", Num_vars, name, uvar[Num_vars].val );

    return(1);
}


double lookup_user_var( char *str )
{   
    int i;
    char charc, buffer[LAB_LEN+2];

    /*  if( evdebug )  {indt(); printf( "uvar: %s\n", str ); }  */

    strncpy( buffer, str, LAB_LEN );
                                                /*  find end of label  */
    /*----note:  valid characters in a user variable name defined here  */
    i = 1;
    charc = buffer[i];
    while( (charc >= 'a' && charc <= 'z') || (charc >= 'A' && charc <= 'Z') ||
        (charc >= '0' && charc <= '9') || charc == '_' || charc == '$' 
        || charc == '[' || charc == ']' || (charc = '-' && buffer[i-1] == '[')) {
        i++;
        charc = buffer[i];
    }

    /*---------check for user function---------*/
    if( buffer[i] == '(' ) {
        buffer[i] = '\0';
        paren_level++;
        return( lookup_user_fn( buffer, str, i+1 ) );
    }

    buffer[i] = '\0';

    if( !Num_vars ) {
        printf( "error: user variable %s not found-no vars registered\n", buffer );
        do_exit(2);
        return(ERR_VAL);
    }

    /*  search for var, most recent first, can be slow, FIX!!!  */
    for( i = Num_vars; i >= 1; i-- ) {
        if( !strcmp( buffer, uvar[i].name ) ) {

                                                /*  local variable  */
            if( uvar[i].name[strlen(uvar[i].name)-1] == '$' ) {
                //if( uvar[i].level != g_level && !fn_eval )  continue;
                if( (uvar[i].level != g_level) || (strcmp( uvar[i].file, g_file ) || strcmp( uvar[i].routine, g_routine )) ) {
                    continue;
                }
            }
            Uvar = i;
                                                /*  string var  */
            if( uvar[i].name[0] == '$' ) {
                strcpy( gstring, strings[uvar[i].str_num] );
                return( (double)string_to_num( gstring) );
            }
            return( uvar[i].val );
        }
    }
    if( buffer[strlen(buffer)-1] == '$' ) {
        printf( "error: user variable %s(lev%d) not set\n", buffer, g_level );
    }
    else {
        printf( "error: user variable %s not set\n", buffer );
    }
    do_exit(2);
    return(ERR_VAL);
}


double lookup_user_fn( char *name, char *str, int exp_pos )
{
    int i, nfn, parens;
    double val1, val2;
    char *sst, *parg[MAX_ARGS+1];

    if( !fn_eval ) {
        fn_level = g_level+1;
        fn_eval = TRUE;
    }

    //g_level++;                                  /*  kick level  */
    if( g_level > 100 ) {
        printf( "error: infinite regress on %s, self reference probable\n", name );
        do_exit(2);
        return(ERR_VAL);
    }

    /*  find the function  */
    for( i = 1; i <= Num_fns; i++ ) {
        if( !strcmp( ufn[i].name, name ) ) {
            nfn = i;
            break;
        }
    }
    if( i == Num_fns+1 )  {
        printf( "error:  user function %s not defined\n", name );
        do_exit(2);
        return(ERR_VAL);
    }

    /*  locate the args, check for correct number  */
    parg[1] = sst = str+exp_pos;

    for( i = 2; i <= ufn[nfn].num_args; i++ ) {
        parens = 0;
        for( ;; ) {
            sst++;
            if( *sst == '(' )  parens++;
            if( *sst == ')' )  parens--;

            if( *sst == ',' ) {
                parg[i] = ++sst;
                break;
            }
            if( !parens && (*sst == ')' || *sst == '\0') ) {
                printf( "error:  too few args in function ref %s\n\n", name );
                do_exit(2);
                return(ERR_VAL);
            }
        }
    }

    for( i = 1, sst = parg[1]; i <= ufn[nfn].num_args; i++, sst = parg[i] ) {
        /*  evaluate the argument expression  */
        if( evdebug )  {indt(); printf( "ufn: arg %d....\n", i ); }

        val1 = exptof( sst );

        /*  assign the arg value  */
        sprintf( stmp, "%e", val1 );
        register_user_var( ufn[nfn].arg[i], stmp, 0 );
    }
    if( !ufn[nfn].num_args )  paren_level--;      /*  loop skipped  */

    /*  evaluate the fn expression  */
    val2 = exptof( ufn[nfn].exp );

    /*  compute jump length  */
    sst = str + exp_pos - 1;
    parens = 1;
    sst++;
    for( ;; ) {
        if( *sst == '\0' )  return(0);
        if( *sst == '(' )  parens++;
        if( *sst == ')' )  parens--;
        sst++;
        if( !parens )  break;
    }
    
    Fn_len = sst - str;

    if( g_level == fn_level ) {
        fn_eval = FALSE;
    }

    cleanup_vars();

    //g_level--;                                  /*  ease level  */

    if( evdebug )  {indt(); printf( "ufn: %s=%g\n", name, val2 ); }
    return( val2 );
}


/*--------------remove all local vars on current level------------------*/

void cleanup_vars( void )
{
    int i, j;
    char name[FIELD_LEN+1];

    return;  /*  put on ice while new routine specific code is tested  */

                                                /*  check for vars  */
    for( i = 1; i <= Num_vars; i++ ) {
        strcpy( name, uvar[i].name );
                                               /*  local variables  */
        if( name[strlen(name)-1] == '$' && uvar[i].level == g_level ) {
            if( i < Num_vars ) {
                for( j = i+1; j <= Num_vars; j++ ) {
                    strcpy( uvar[j-1].name, uvar[j].name );
                    uvar[j-1].len = uvar[j].len;
                    uvar[j-1].val = uvar[j].val;
                    uvar[j-1].level = uvar[j].level;
                    uvar[j-1].str_num = uvar[j].str_num;
                }
            }
            Num_vars--;
            i--;
        }
    }
}


/*---------------------------------  parse functions  */

double parse_function( char *str )
{
    double val, val2;
    int i, itmp;

    if( evdebug )  {indt(); printf( "pfun: %s\n", str ); }

                                                /*  true / false  */

    if( *str == 't' && *(str+1) == 'r' && *(str+2) == 'u' && *(str+3) == 'e' ) {
        return( 1. );
    }
    if( *str == 'f' && *(str+1) == 'a' && *(str+2) == 'l' && *(str+3) == 's' && *(str+4) == 'e' ) {
        return( 0. );
    }

                                                /*  loop indices  */
    if( *str == 'i' && *(str+1) == 'i' ) {
        return( gloop_i_index );
    }
    if( *str == 'j' && *(str+1) == 'j' ) {
        return( gloop_j_index );
    }
    if( *str == 'k' && *(str+1) == 'k' ) {
        return( gloop_k_index );
    }
                                                /*  e  */
    if( *str == 'e' && *(str+1) == 'e' ) {
        return( exp(1.) );
    }
                                                /*  pi  */
    if( *str == 'p' && *(str+1) == 'i' ) {
        return( PI );
    }
                                                /*  dec  */
    if( *str == 'd' && *(str+1) == 'e' && *(str+2) == 'c' ) {
        return( decimals );
    }
                                                /*  wid  */
    if( *str == 'w' && *(str+1) == 'i' && *(str+2) == 'd' ) {
        return( field_width );
    }
           
                                                /*  query  */
    if( *str == 'q' && *(str+1) == 'q' ) {
        return( (double)query_result );
    }
                                                /*  ver  */
    if( *str == 'v' && *(str+1) == 'e' && *(str+2) == 'r' ) {
        return( (double)VERSION );
    }
                                                /*  eof  */
    if( *str == 'e' && *(str+1) == 'o' && *(str+2) == 'f' ) {
        return( (double)end_of_file );
    }
                                                /*  err  */
    if( *str == 'e' && *(str+1) == 'r' && *(str+2) == 'r' ) {
        itmp = data_error;
        data_error = FALSE;
        return( (double)itmp );
    }
                                                /*  ip  */
    if( *str == 'i' && *(str+1) == 'p' ) {
        paren_level++;
        val = parse_expression( str+3 );
        if( val >= 0 )  return( floor( val ) );
        else            return( ceil( val ) );
    }
                                                /*  fp  */
    if( *str == 'f' && *(str+1) == 'p' ) {
        paren_level++;
        val = parse_expression( str+3 );
        if( val >= 0 )  return( val - floor( val ) );
        else            return( val - ceil( val ) );
    }
                                                /*  abs  */
    if( *str == 'a' && *(str+1) == 'b' && *(str+2) == 's' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( fabs( val ) );
    }
                                                /*  int  */
    if( *str == 'i' && *(str+1) == 'n' && *(str+2) == 't' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( floor( val + 0.5 ) );
    }
                                                /*  floor  */
    if( *str == 'f' && *(str+1) == 'l' && *(str+2) == 'o' && *(str+3) == 'o' && *(str+4) == 'r' ) {
        paren_level++;
        val = parse_expression( str+6 );
        return( floor( val ) );
    }
                                                /*  ceil  */
    if( *str == 'c' && *(str+1) == 'e' && *(str+2) == 'i' && *(str+3) == 'l' ) {
        paren_level++;
        val = parse_expression( str+5 );
        return( ceil( val ) );
    }
                                                /*  deg = radians/degree */
    if( *str == 'd' && *(str+1) == 'e' && *(str+2) == 'g' ) {
        return( PI / 180. );
    }
                                                /*  rad = old form  */
    if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'd' ) {
        return( PI / 180. );
    }
                                                /*  double ran  */
    if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n' && *(str+3) == 'd') {
        return( drnd() );
    }
                                                /*  normal ran  */
    if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n' && *(str+3) == 'g') {
        return( rangauss()  );
    }
                                                /*  Weibull ran  */
    if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n' && *(str+3) == 'w') {
        return( rand_weibull( w_low, w_cent, w_n, w_m )  );
    }
                                                /*  ran2  */
    if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n' && *(str+3) == '2' ) {
        return( 2. * rnd() - 1. );
    }
                                                /*  ran  */
    if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n' ) {
        return( rnd() );
    }
                                                /*  sq  */
    if( *str == 's' && *(str+1) == 'q' && *(str+2) == '(' ) {
        paren_level++;
        val = parse_expression( str+3 );
        return( sq( val ) );
    }
                                                /*  cub  */
    if( *str == 'c' && *(str+1) == 'u' && *(str+2) == 'b' && *(str+3) == '(' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( cub( val ) );
    }
                                                /*  cbrt  */
    if( *str == 'c' && *(str+1) == 'b' && *(str+2) == 'r' && *(str+3) == 't' && *(str+4) == '(' ) {
        paren_level++;
        val = parse_expression( str+5 );
        return( pow( val, 0.333333333 ) );
    }
                                                /*  sqrt  */
    if( *str == 's' && *(str+1) == 'q' && *(str+2) == 'r' && *(str+3) == 't' && *(str+4) == '(' ) {
        paren_level++;
        val = parse_expression( str+5 );
        return( sqrc( val ) );
    }
                                                /*  sign  */
    if( *str == 's' && *(str+1) == 'i' && *(str+2) == 'g' && *(str+3) == 'n' && *(str+4) == '(' ) {
        paren_level++;
        val = parse_expression( str+5 );
        if( !val )  return( 0. );
        else if( val > 0 )  return 1.;
        else return( -1. );
    }
                                                /*  fact  */
    if( *str == 'f' && *(str+1) == 'a' && *(str+2) == 'c' && *(str+3) == 't' && *(str+4) == '(' ) {
        paren_level++;
        val = parse_expression( str+5 );
        if( !val )  return( 0. );
        itmp = (int)floor(val+0.5);
		for( i = itmp, val2 = 1; i >= 1; i-- )  val2 *= i;
        return( val2 );
    }
                                                /*  sin  */
    if( *str == 's' && *(str+1) == 'i' && *(str+2) == 'n' && *(str+3) == '(' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( sin( val ) );
    }
                                                /*  cos  */
    if( *str == 'c' && *(str+1) == 'o' && *(str+2) == 's' && *(str+3) == '(' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( cos( val ) );
    }
                                                /*  tan  */
    if( *str == 't' && *(str+1) == 'a' && *(str+2) == 'n' && *(str+3) == '(' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( tan( val ) );
    }
                                                /*  asin   */
    if( *str == 'a' && *(str+1) == 's' && *(str+2) == 'i' && *(str+3) == 'n' && *(str+4) == '(' ) {
        paren_level++;
        val = parse_expression( str+5 );
        return( asin( val ) );
    }
                                                /*  acos   */
    if( *str == 'a' && *(str+1) == 'c' && *(str+2) == 'o' && *(str+3) == 's' && *(str+4) == '(' ) {
        paren_level++;
        val = parse_expression( str+5 );
        return( acos( val ) );
    }
                                                /*  atan   */
    if( *str == 'a' && *(str+1) == 't' && *(str+2) == 'a' && *(str+3) == 'n' && *(str+4) == '(' ) {
        paren_level++;
        val = parse_expression( str+5 );
        return( atan( val ) );
    }
                                                /*  atan2   */
    if( *str == 'a' && *(str+1) == 't' && *(str+2) == 'a' && *(str+3) == 'n' && *(str+4) == '2' && *(str+5) == '(' ) {
        paren_level++;
        val = parse_expression( str+6 );
		for(i=1; i<=51; i++ ) {
			if( *(str+6+i) == ',' )  break;
		}
		val2 = parse_expression( str+6+i );
        return( atan2( val, val2 ) );
    }
                                                /*  log  */
    if( *str == 'l' && *(str+1) == 'o' && *(str+2) == 'g' && *(str+3) == '(' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( log10c( val ) );
    }
                                                /*  ln  */
    if( *str == 'l' && *(str+1) == 'n' && *(str+2) == '(' ) {
        paren_level++;
        val = parse_expression( str+3 );
        return( logc( val ) );
    }
                                                /*  exp  */
    if( *str == 'e' && *(str+1) == 'x' && *(str+2) == 'p' && *(str+3) == '(' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( exp( val ) );
    }
                                                /*  exp10  */
    if( *str == 'e' && *(str+1) == 'x' && *(str+2) == 'p' && *(str+3) == '1' && *(str+4) == '0' && *(str+5) == '(' ) {
        paren_level++;
        val = parse_expression( str+6 );
        return( exp10( val ) );
    }
												/*  cubic b-spline  */
    if( *str == 's' && *(str+1) == 'p' && *(str+2) == 'l' ) {
        paren_level++;
        val = parse_expression( str+4 );
        return( bspl3( val ) );
    }

/*-------------------------- if test ---------------------------------------*/

    if( *str == 'i' && *(str+1) == 'f' && *(str+2) == '(' ) {
        return( do_if( str ) );
    }

/*-------------------------- list fns --------------------------------------*/
                                                /*  lmin - list  */
    if( *str == 'm' && *(str+1) == 'i' && *(str+2) == 'n' && *(str+3) == '(' ) {
        return( do_lmin( str ) );
    }
                                                /*  lmax - list  */
    if( *str == 'm' && *(str+1) == 'a' && *(str+2) == 'x' && *(str+3) == '(' ) {
        return( do_lmax( str ) );
    }
	                                            /*  loop indices  */
    if( *str == 'i' ) {
        return( gloop_i_index );
    }
    if( *str == 'j' ) {
        return( gloop_j_index );
    }
    if( *str == 'k' ) {
        return( gloop_k_index );   
    }

    printf( "eval:  unknown function: %s\n", str );
    do_exit(2);
    return(ERR_VAL);
}


/*---------------------------------  move string pointer to end of number */

char *advance( char *str )
{
    int parens=0, eprev=0;
    char *str0;
    LOGICAL conflict;

    /* if( evdebug )  {indt(); printf( "adv: %s", str ); } */
    str0 = str;

                                               /*  check for ijk conflicts  */
    conflict = FALSE;
    if( (*str == 'i' && *(str+1) == 'n' && *(str+2) == 't') ||
        (*str == 'i' && *(str+1) == 'p') || (*str == 'i' && *(str+1) == 'f') )
        conflict = TRUE;

                                                /*  user functions  */
    if( Fn_len ) {
        str += Fn_len;
        Fn_len = 0;
    }

                                                /*  user variables  */
    else if( (*str >= 'A' && *str <= 'Z') || *str == '$' ) {
        str += uvar[Uvar].len;
    }
                                                /*  no arg function skip  */
    else if( *str == 't' && *(str+1) == 'r' && *(str+2) == 'u'  && *(str+3) == 'e' )  str += 4;
    else if( *str == 'f' && *(str+1) == 'a' && *(str+2) == 'l' && *(str+3) == 's' && *(str+4) == 'e' )  str += 5;
    else if( *str == 'e' && *(str+1) == 'e' )  str += 2;
    else if( *str == 'i' && *(str+1) == 'i' )  str += 2;
    else if( *str == 'j' && *(str+1) == 'j' )  str += 2;
    else if( *str == 'k' && *(str+1) == 'k' )  str += 2;
    else if( *str == 'p' && *(str+1) == 'i' )  str += 2;
    else if( *str == 'q' && *(str+1) == 'q' )  str += 2;
    else if( *str == 'v' && *(str+1) == 'e' && *(str+2) == 'r' )  str += 3;
    else if( *str == 'd' && *(str+1) == 'e' && *(str+2) == 'c' )  str += 3;
    else if( *str == 'w' && *(str+1) == 'i' && *(str+2) == 'd' )  str += 3;
    else if( *str == 'e' && *(str+1) == 'o' && *(str+2) == 'f' )  str += 3;
    else if( *str == 'e' && *(str+1) == 'r' && *(str+2) == 'r' )  str += 3;
    else if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n'  && *(str+3) == 'w' )  str += 4;
    else if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n'  && *(str+3) == 'g' )  str += 4;
    else if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n'  && *(str+3) == 'd' )  str += 4;
    else if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n'  && *(str+3) == '2' )  str += 4;
    else if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'n' )  str += 3;
    else if( *str == 'd' && *(str+1) == 'e' && *(str+2) == 'g' )  str += 3;
    else if( *str == 'r' && *(str+1) == 'a' && *(str+2) == 'd' )  str += 3;
    
                                                /*  single char no arg fns  */
    else if( *str == 'i' && !conflict )  str += 1;
    else if( *str == 'j' && !conflict )  str += 1;
    else if( *str == 'k' && !conflict )  str += 1;

                                                /*  arg functions  */
    else if( *str >= 'a' && *str <= 'z' ) {
        while( *str != '(' )  str++;
        parens = 1;
        str++;
        for( ;; ) {
            if( *str == '\0' )  return(0);
            if( *str == '(' )  parens++;
            if( *str == ')' )  parens--;
            str++;
            if( !parens )  break;
        }
    }
 
                                                /*  list fn exp case  */
    else if( *str == '&' ) {
        str++;
        parens = 0;
        for( ;; ) {
            if( *str == '\0' )  return(0);
            if( *str == '(' )  parens++;
            if( *str == ')' )  parens--;
            str++;
            if( *str == ',' && !parens )  break;
        }
    }
                                                /*  recurse case  */
    else if( *str == '(' ) {
        parens = 1;
        str++;
        for( ;; ) {
            if( *str == '\0' )  return(0);
            if( *str == '(' )  parens++;
            if( *str == ')' )  parens--;
            str++;
            if( !parens )  break;
        }
    }
                                                /*  normal case  */
    else {
        for( ;; ) {
            if( (*str == '+' || *str == '-' || *str == '~' ) && !eprev )  break;
            if( *str == '*' || *str == '/' )  break;
            if( *str == '^' )  break;
            if( *str == '%' )  break;
            if( *str == ')' )  break;
            if( *str == ',' )  break;
            if( *str == '!' )  break;

            if( *str == '>' )  break;
            if( *str == '<' )  break;
            if( *str == '=' )  break;
            if( *str == '&' )  break;
            if( *str == '|' )  break;

            if( *str == '\0' )  break;
                                                /*  handle exponent, exclude 'ee' */
            if( (*str == 'e' || *str == 'E') && (*(str-1) != 'e') )  eprev = 1;
            else eprev = 0;
            str++;
        }
    }
    /* if( evdebug )  printf( "..%d\n", (int)(str-str0) ); */
    return( str );
}



/*-------------- insert char c in string str, in location n --------------*/

void insert_char( char *str, char c, int n )
{
    char buffer[512];
    
    strncpy( buffer, str, 512 );
    strcpy( str+n+1, buffer+n );
    str[n] = c;
}



/*--------------------------------- add final comma -----------*/
/*         needed for if   */

int fix_list_fn( char *str )
{
    char *ptr;
    int parens=0, index;

    for( ptr = str; *ptr != '\0'; ptr++ ) {
        if( *ptr == '(' ) {
            parens++;
        }
        else if( *ptr == ')' ) {
            parens--;
                                                /*  found end of fn  */
            if( !parens ) {
                                                /*  got comma, return  */
                if( *(ptr-1) == ',' ) {
                    return(1);
                }
                                                /*  insert comma  */
                else {
                    index = ptr - str;
                    insert_char( str, ',', index );
                    return(1);
                }
            }
        }
    }

    return(1);
}


/*--------------------------------- if test -----------*/
/*          str must be in the form if( exp0,exp1,exp2,exp3 )       */

double do_if( char *str )
{
    char *ptr;
    int  i;
    double val=0., tif=0., vif=0.;
                                                /*  add final comma  */
    fix_list_fn( str );

    if( evdebug )  {indt(); printf( "if: %s\n", str ); }

                                                /*  do if  */
    ptr = str+3;
    paren_level++;

    for( i = 0; i <= 3; i++ ) {
                                                /*  skip spaces, commas  */
        while( *ptr == ' ' || *ptr == ',' ) {
            ptr++;
        }
        if( evdebug )  {indt(); printf( "  if: param %d, 1st char=%c\n", i, *ptr ); }

                                                /*  <=, >= cases  */
        if( i >= 1 && *ptr == '*' ) {
            if( evdebug )  {indt(); printf( "  if..dup..(%g)\n", val ); }
            while( *ptr != ',' )  ptr++;
            goto value;
        }
                                                /*  flag this case  */
        insert_char( ptr, '&', 0 );

        val = parse_expression( ptr+1 ); 
        ptr = advance( ptr );
                                                /*  test val  */
        if( i == 0 ) {
            tif = val;
            if( evdebug )  {indt(); printf( "if( %g )\n", tif ); }
        }
                                                /*  result  */
value:
        if( i == 1 && tif < 0. ) {
            vif = val;
            break;
        }
        if( i == 2 && tif == 0. ) {
            vif = val;
            break;
        }
        if( i == 3 && tif > 0. ) {
            vif = val;
            break;
        }
    }
                                                /*  exit here, close paren  */
    paren_level--;
    if( evdebug )  {indt(); printf( "<--if = %g\n", vif ); }
    return( vif );
}



/*--------------------------------- min a list of expressions -----------*/
/*              str must be in the form lmin( , , .. )       */

double do_lmin( char *str )
{
    char *ptr;
    int  i;
    double val, smin=0.;
                                                /*  add final comma  */
    fix_list_fn( str );

    if( evdebug )  {indt(); printf( "lmin: %s\n", str ); }

                                                /*  do list  */
    /* ptr = str+5;  */
    ptr = str+4;
    paren_level++;

    for( i = 1; i <= 50; i++ ) {
                                                /*  skip spaces, commas  */

        while( *ptr == ' ' || *ptr == ',' || *ptr == ')' ) {

                                                /*  main exit  */
            if( *ptr == ')' ) {
                paren_level--;
                if( evdebug )  {indt(); printf( "<.-lmin = %g\n", smin ); }
                return( smin );
            }
            ptr++;
        }
        if( evdebug )  {indt(); printf( "lmin: param %d, 1st char=%c\n", i, *ptr ); }

                                                /*  flag this case  */
        insert_char( ptr, '&', 0 );

        val = parse_expression( ptr+1 ); 
        ptr = advance( ptr );

        if( i == 1 )  smin = val;
        else          smin = fmin( smin, val );
    }
    if( evdebug )  {indt(); printf( "<--lmin = %g\n", smin ); }
    return( smin );
}


/*--------------------------------- max a list of expressions -----------*/
/*              str must be in the form lmax( , , .. )       */

double do_lmax( char *str )
{
    char *ptr;
    int  i;
    double val, smax=0.;
                                                /*  add final comma  */
    fix_list_fn( str );

    if( evdebug )  {indt(); printf( "lmax: %s\n", str ); }

                                                /*  do list  */
    ptr = str+4;
    paren_level++;

    for( i = 1; i <= 50; i++ ) {
                                                /*  skip spaces, commas  */

        while( *ptr == ' ' || *ptr == ',' || *ptr == ')' ) {

                                                /*  main exit  */
            if( *ptr == ')' ) {
                paren_level--;
                if( evdebug )  {indt(); printf( "<.-lmax = %g\n", smax ); }
                return( smax );
            }
            ptr++;
        }
        if( evdebug )  {indt(); printf( "lmax: param %d, 1st char=%c\n", i, *ptr ); }

                                                /*  flag this case  */
        insert_char( ptr, '&', 0 );

        val = parse_expression( ptr+1 ); 
        ptr = advance( ptr );

        if( i == 1 )  smax = val;
        else          smax = fmax( smax, val );
    }
    if( evdebug )  {indt(); printf( "<--lmax = %g\n", smax ); }
    return( smax );
}

  /*---------------------------- foolproof sqrt function  */

double sqrc( double x )
{
    if( x == 0. )  return( 0. );
    else           return( sqrt( fabs( x ) ) );
}


double exp10( double x ) 
{
    return( exp( log( 10. ) * x ) );
}


/*  cubic B-Spline (sometimes called W4)  */
/*  unit width and unit area              */
/*  center at 0, zero beyond +/- 2        */
/*  peak value = 2/3 at origin            */

double bspl3( double z ) 
{
	double tmp;

	z = fabs( z );

    if( z < 1.0 ) {
        tmp = (2./3. - sq( z ) + cub( z )/2.);
    }
    else if( z < 2.0 ) {
        tmp = cub( 2. - z ) / 6.;
    }
    else {
        tmp = 0.;
    }
    //printf( "\nbspline, z = %g, tmp = %g\n", z, tmp );
    return( tmp );
}


  /*-------------------------- gaussian random numbers  */
  /*  this generator is a little noisy near 0, but otherwise good  */
  /*  be sure to use only every other number!!  */

double rangauss()
{
    double fac, rsq, v1, v2;

    do {
        v1 = 2.0 * rnd() - 1.0;
        v2 = 2.0 * rnd() - 1.0;
        rsq = v1 * v1 + v2 * v2;
    } while( rsq >= 1.0 || rsq == 0.0 );
    fac = sqrt( -2.0 * log( rsq ) / rsq );
    return( v2 * fac );
}



/*  Weibull distribution --

   prob density = [v * m * x - shift)^(m-1)/center^m] * exp( -[(x - shift)/center]^m * v ) 
   integral = 1 - exp( -[(x - shift)/center]^m * v ) 

   lower = lower limit of values (has units)
   center = 63rd percentile (central value above lower)  (has units)
   m = shape parameter, >= 2 for a peaked distribution  (dimensionless)
   n = V / V0 = N = number of flaws/items               (dimensionless)

   For steel, shift = 3.78e9 dyne/cm^2, center = 0.758e9,   m = 2.93

  */
   
double rand_weibull( double lower, double center, double n, double m )
{
    double tmp;

    if( n == 0. )  return( 0. );
    if( m == 0. )  return( 0. );
    tmp = rnd();
    if( tmp >= 1. )  tmp = 0.9999;
    if( tmp )        tmp = -log( tmp ) / n;
    tmp = lower + center * pow( tmp, 1. / m );

    return( tmp );
}


/*  create a unique number for any string, then compare numbers  */

int string_to_num( char *str )
{
	int i, num=0;

	for( i = 0; i < (int)strlen(str); i++ ) {
      num += str[i]*(int)pow( 10, (double)i);
	}
	return( num );
}