/*  command.c -- process SPH setup commands  */
/*  $Id: $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  this is the module that processes the command input  */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <ctype.h>

#include <time.h>   /*  for seed  */

#define EXTERN extern
#include "s_tran.h"

/*--------------------------------------------------------
process_cmds() - S-Tran command set
    called by read_input_file()
----------------------------------------------------------*/

static char labels[MAX_FIELDS+1][FIELD_LEN+1];
static double data[MAX_FIELDS+1];

/*  loops  */
extern int gloop_active;

/*  Weibull params  */
extern double w_low, w_cent, w_n, w_m;

/*  mult regress params  */
extern int mr_args, nat[];
extern double tol1, tol2, tol3;
int set_tol;

/*  cluster params;  */
extern int Clusters;
extern double Variance;

/*  sort, solve data  */
extern int ne, na;
extern double xx[MAX_LINES+1][MAX_FIELDS+1];
double yy[MAX_FIELDS+1], x0[MAX_FIELDS+1];

/*  Lomb flag  */
#define MAXDATL   2500
extern int amp_units, psd_units;

/*  PDM  */
#define MAXDAT     1600000                  /*  must agree with the defs in pdm, pdm2  */
#define SC_MAX     100
int pdm_data_read=FALSE;

/*  PDM and Lomb functions  */
int set_pdm_data( void );
int set_lomb_data( void );
int read_data_file( char *file, int title_lines );

/*----PDM parameters----*/
extern int invert_curve;                          /*  flip curve                       */
extern int lpoints;                               /*  freq points per line             */
extern double minf0, maxf0, segdev;               /*  run params                       */
extern double beta_min, beta_max;                 /*  period change mode               */
extern double beta_scale;						  /*  scale factor for beta            */
extern double phase_shift;                        /*  shift for pdmcurve               */
extern int nb0, do_beta_scan;					  /*  points in beta scan              */
extern int do_subharm, do_dist;                   /*  distributions                    */
extern int bin_10;                                /*  10/1 bin flag                    */
extern int do_linear_fit;                         /*  linear curve fitting             */
extern int do_spline_fit;                         /*  spline curve fitting             */
extern int pdm_verbose;                           /*  generate screen output           */
extern int pdm_debug;							  /*  turn on debugging                */
extern int do_non_par;							  /*  non-parametric sig test          */
extern int do_sigmas;						      /*  use sigmas in computation        */
 
/*---PDM results ----*/
extern double trange;							   /* range of time                    */
extern double fthmin[4], thmin[4], signf[4];       /* freq,theta,signif at 3 minima    */
extern double bin_mean[11], bin_var[11];           /* bin mean and variance            */
extern int nbin[11], nf;                           /* points per bin / per scan        */
extern double f_min, f_max, theta2[MAXDAT+1];      /* final theta scan result          */
extern double ratio;                               /* rescale factor for big sigmas    */
extern int n0, n1;                                 /* range in the array               */
extern char prefix[11];                            /* run prefix                       */

static double datx[MAXDAT+1], daty[MAXDAT+1], sig[MAXDAT+1];


/*------------ this is the standard parameter processor ------------------------*/

int process_cmds( char *command, int nargs, char args[MAX_ARGS+1][FIELD_LEN+1] )
{
    int i, i1, j, ret, exist, q_user_var, title_lines;
    int len, len1, len2, count, first, last, char_num, window;
    LOGICAL password, fread;
    double val;
    char stmp2[121], *pstr;
    time_t ltime;
	
    if( !strcmp( command, "noexit"  ) ) {
        if( !nargs )   noexit = TRUE;
        else if( nargs == 1 )   noexit = exptoi( args[1] );
        else  do_error( "Bad noexit command line" );
        return(1);
    }

    /*=========================debug==============================*/

    else if( !strcmp( command, "debug"  ) ) {
        if( !nargs )   debug = TRUE;
        else if( nargs == 1 )   debug = exptoi( args[1] );
        else  do_error( "Bad debug command line" );
        return(1);
    }
    else if( !strcmp( command, "step"  ) ) {
        if( !nargs )   single_step = TRUE;
        else if( nargs == 1 )   single_step = exptoi( args[1] );
        else  do_error( "Bad step command line" );
        debug = single_step;
        return(1);
    }
    else if( !strcmp( command, "debug_inp"  ) ) {
        if( !nargs )   DEBUG_INP = TRUE;
        else if( nargs == 1 )   DEBUG_INP = exptoi( args[1] );
        else  do_error( "Bad debug_inp command line" );
        return(1);
    }
    else if( !strcmp( command, "debug_loop"  ) ) {
        if( !nargs )   DEBUG_LOOP = TRUE;
        else if( nargs == 1 )   DEBUG_LOOP = exptoi( args[1] );
        else  do_error( "Bad debug_loop command line" );
        return(1);
    }
    else if( !strcmp( command, "debug_if"  ) ) {
        if( !nargs )   DEBUG_IF = TRUE;
        else if( nargs == 1 )   DEBUG_IF = exptoi( args[1] );
        else  do_error( "Bad debug_if command line" );
        return(1);
    }

    /*=========================const==============================*/

    else if( !strcmp( command, "constant"  ) ) {
        if( !nargs )   constant_value = TRUE;
        else if( nargs == 1 )   constant_value = exptoi( args[1] );
        else  do_error( "Bad constant command line" );
        return(1);
    }

    /*=====================user functions=========================*/

    else if( !strcmp( command, "function" ) ) {
        if( nargs != 2 )  do_error( "Bad function definition" );
        if( args[1][0] == '$' ) {
            printf( "\nerror: user-defined string functions not implemented: %s\n", args[1] );
            do_exit(2);
        }
        if( args[2][0] == '$' ) {
            exptof( args[2] );
            strcpy( args[2], gstring );
        }

        register_user_fn( args[1], args[2] );

        return(1);
    }


    /*=========================parameters=========================*/

    else if( !strcmp( command, "seed" ) ) {
        if( nargs != 1 && nargs != 2 )  do_error( "Bad seed command line" );
        if( !strcmp( args[1], "ran" ) ) {
            time( &ltime );
            srnd( (unsigned)ltime );
        }
        else {
            i1 =  exptoi( args[1] );
            srnd( (unsigned)i1 );
        }
        return(1);
    }

    else if( !strcmp( command, "set_weib" ) ) {
        if( nargs != 4 )  do_error( "Bad set_weib command line" );
        w_low = exptof( args[1] );
        w_cent = exptof( args[2] );
        w_n = exptof( args[3] );
        w_m = exptof( args[4] );
        return(1);
    }


    /*=========================input commands=====================*/

    else if( !strcmp( command, "input" ) ) {
        if( !nargs )  do_error( "Bad input command line" );
		data_error = FALSE;
        end_of_file = FALSE;
        for( i = 1; i <= nargs; i++ ) {
            
            /*  use the "init" flag to check if already initialized  */
            ret = register_user_var( args[i], "0", 1 );
            if( ret <= 0 ) {
                exist = TRUE;
                val = exptof( args[i] );
                if( args[i][0] == '$' )  printf( "    %s (%s) =?  ", args[i], gstring );
                else  printf( "    %s (%g) =?  ", args[i], val );
            }
            else {
                exist = FALSE;
                printf( "    %s =?  ", args[i] );
            }
            
            ret = fgetstr( stdin, stmp, LINE_LEN );
            if( stmp[0] == ESC )  do_exit( 2 );
            
            if(  ret > 0 ) {
                if( !strcmp( stmp, "end" ) || !strcmp( stmp, "done" ) ||
                    !strcmp( stmp, "eof" ) ) {
                    end_of_file = TRUE;
                    return(0);
                }
                register_user_var( args[i], stmp, 0 );
            }
            /*  empty string input, create anyway  */
            else if( !exist ) {
                if( args[i][0] == '$' )  register_user_var( args[i], "", 0 );
                else                     register_user_var( args[i], "0", 0 );
            }
        }
        return(1);
    }

    else if( !strcmp( command, "input0" ) ) {
        if( !nargs )  do_error( "Bad input0 command line" );
		data_error = FALSE;
        end_of_file = FALSE;
        for( i = 1; i <= nargs; i++ ) {

            /*  use the "init" flag to check if already initialized  */
            ret = register_user_var( args[i], "0", 1 );
            if( ret <= 0 ) {
                exist = TRUE;
                val = exptof( args[i] );
                if( args[i][0] == '$' ) {
                    if( gstring[0] )  printf( " (%s) =? ", gstring );
                    else              printf( " =? " );
                }
                else  printf( " (%g) =?  ", val );
            }
            else {
                exist = FALSE;
                printf( " =?  " );
            }

            ret = fgetstr( stdin, stmp, LINE_LEN );
            if( stmp[0] == ESC )  do_exit( 2 );
            
            if(  ret > 0 ) {
                if( !strcmp( stmp, "end" ) || !strcmp( stmp, "done" ) ||
                    !strcmp( stmp, "eof" ) ) {
                    end_of_file = TRUE;
                    return(0);
                }
                register_user_var( args[i], stmp, 0 );
            }
            /*  empty string input, create anyway  */
            else if( !exist ) {
                if( args[i][0] == '$' )  register_user_var( args[i], "", 0 );
                else                     register_user_var( args[i], "0", 0 );
            }
        }
        return(1);
    }

    else if( !strcmp( command, "query" ) ) {
		data_error = FALSE;
        q_user_var = 0;
        if( nargs == 2) {
            if( args[2][0] == 'y' )  query_result = 1;
            else if( args[2][0] == 'n' )  query_result = 0;
            else if( args[2][0] >= 'A' && args[2][0] <= 'Z' ) {
                query_result = (int)lookup_user_var( args[2] );
                q_user_var = 1;
            }
            else  do_error( "Bad query command line" );
        }
        else if( nargs != 1)  do_error( "Query prompt needed" );
        else  query_result = 0;

        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( stmp, gstring );
        }
        else  strcpy( stmp, args[1] );

        do {
            if( nargs == 1 )         printf( "    %s:  ", stmp );
            else if( query_result )  printf( "    %s (y):  ", stmp );
            else                     printf( "    %s (n):  ", stmp );
            ret = fgetstr( stdin, stmp, LINE_LEN );
            if( stmp[0] == ESC )  do_exit( 2 );
            if( ret > 0 && stmp[0] != 'y' && stmp[0] != 'n' ) {
                printf( "      please type y, n, or <cr>\n" );
            }
            else  break;
        } while( 1 );

        if( ret ) {
            if( stmp[0] == 'y' )  query_result = 1;
            else                  query_result = 0;
            if( q_user_var ) {
                if( stmp[0] == 'y' )  register_user_var( args[2], "1", 0 );
                else                  register_user_var( args[2], "0", 0 );
            }
        }
        return(1);
    }


    /*=========================string commands===================*/

    else if( !strcmp( command, "str_len"  ) ) {
        if( nargs != 1 )  do_error( "Bad str_len line" );
        if( args[1][0] == '$' ) {
            lookup_user_var( args[1] );
            strcpy( args[1], gstring );
        }
        len = strlen( args[1] );
        sprintf( stmp, "%d", len );
        register_user_var( "S_len", stmp, 0 );
    }

    else if( !strcmp( command, "str_char"  ) ) {
        if( nargs != 2 )  do_error( "Bad str_char line" );
        if( args[1][0] == '$' ) {
            lookup_user_var( args[1] );
			if( strlen( gstring) > FIELD_LEN )  do_error( "str_char: string too long" );
            strcpy( args[1], gstring );
        }
        len = exptoi( args[2] );
		if( len > (int)strlen(args[1]) )  stmp[0] = '\0';
        else   sprintf( stmp, "%c%c", args[1][len-1], '\0' );
        register_user_var( "$S_char", stmp, 0 );
    }

    /*  create a random string  */
    else if( !strcmp( command, "str_ran"  ) ) {
        if( nargs != 3 && nargs != 4 )  do_error( "Bad str_ran line" );
        len = exptoi( args[2] );
        password = FALSE;
        if( !strcmp( args[3], "pswd" ) ) {
            first = 48;
            last = 109;
            password = TRUE;
        }
        else {
            first = args[3][0];
            last = args[4][0];
        }
        if( !len )  do_error( "str_ran:  zero length string requested" );
        for( i = 1; i <= len; i++ ) {
            char_num = iran( first, last );
            if( password ) {
                if( char_num >= 58 )  char_num += 7;
                if( char_num >= 91 )  char_num += 6;
            }
            stmp[i-1] = char_num;
        }
        stmp[len] = '\0';
        register_user_var( args[1], stmp, 0 );
    }

    /*  convert string to float  */
    else if( !strcmp( command, "str_tofloat"  ) ) {
        if( nargs != 2 )  do_error( "Bad str_tofloat line" );

        if( args[2][0] == '$' ) {
            lookup_user_var( args[2] );
            strcpy( args[2], gstring );
        }
        register_user_var( args[1], args[2], 0 );
    }

    /*  convert first character to upper case  */
    else if( !strcmp( command, "str_cap"  ) ) {
        if( nargs != 1 || args[1][0] != '$' )  do_error( "Bad str_cap line" );

        lookup_user_var( args[1] );  /*  value in gstring  */
        if( islower( gstring[0] ) )  gstring[0] = toupper( gstring[0] );
        
        register_user_var( args[1], gstring, 0 );
    }

    /*  convert all characters to upper case  */
    else if( !strcmp( command, "str_upper"  ) ) {
        if( nargs != 1 || args[1][0] != '$' )  do_error( "Bad str_upper line" );

        lookup_user_var( args[1] );  /*  value in gstring  */

		for( i = 0; i <= (int)strlen( gstring ); i++ ) {
            if( islower( gstring[i] ) )  gstring[i] = toupper( gstring[i] );
		}
        register_user_var( args[1], gstring, 0 );
    }

    /*  convert all characters to lower case  */
    else if( !strcmp( command, "str_lower"  ) ) {
        if( nargs != 1 || args[1][0] != '$' )  do_error( "Bad str_lower line" );

        lookup_user_var( args[1] );  /*  value in gstring  */

		for( i = 0; i <= (int)strlen( gstring ); i++ ) {
            if( isupper( gstring[i] ) )  gstring[i] = tolower( gstring[i] );
		}
        register_user_var( args[1], gstring, 0 );
    }


    /*  compare strings, return "true" if equal  */
    else if( !strcmp( command, "str_eq"  ) ) {
        if( nargs != 2 && nargs != 3 )  do_error( "Bad str_eq line" );
        if( args[1][0] == '$' ) {
            lookup_user_var( args[1] );
            strcpy( args[1], gstring );
        }
        if( args[2][0] == '$' ) {
            lookup_user_var( args[2] );
            strcpy( args[2], gstring );
        }
        ret = strcmp( args[1], args[2] );
        if( !ret )  query_result = 1;
        else  query_result = 0;

        sprintf( stmp, "%d", ret );
        register_user_var( "S_comp", stmp, 0 );

        if( nargs == 3 )  window = exptoi( args[3] );
        else              window = 1000;

        /*  compute matching characters  */
        len1 = strlen( args[1] );
        len2 = strlen( args[2] );
        len = fmin( len1, len2 );
        for( i = 1, count = 0; i <= len; i++ ) {
            if( args[1][i-1] == args[2][i-1] )  count++;
        }
        sprintf( stmp, "%d", count );
        register_user_var( "S_eq", stmp, 0 );

        /*  compute off-matched characters  */

        for( i = 1, count = 0; i <= len1; i++ ) {
            for( j = fmax( 1, i-window ); j <= fmin( len2, i+window ); j++ ) {
                if( i == j )  continue;
                if( args[1][i-1] == args[2][j-1] )  count++;
            }
        }
        sprintf( stmp, "%d", count );
        register_user_var( "S_off", stmp, 0 );

        return(1);
    }

    /*  find substring, dissect */
    else if( !strcmp( command, "str_sub"  ) ) {
        if( nargs != 2 )  do_error( "Bad str_add line" );
        if( args[1][0] == '$' ) {
            lookup_user_var( args[1] );
            strcpy( args[1], gstring );
        }
        if( args[2][0] == '$' ) {
            lookup_user_var( args[2] );
            strcpy( args[2], gstring );
        }
		pstr = strstr( args[1], args[2] );
		if( !pstr ) {
            register_user_var( "S_found", "0", 0 );
            register_user_var( "$S_head", args[1], 0 );
            register_user_var( "$S_tail", "", 0 );
		}
		else {
            register_user_var( "S_found", "1", 0 );
            register_user_var( "$S_tail", pstr+strlen(args[2]), 0 );
	     	*pstr = '\0';
            register_user_var( "$S_head", args[1], 0 );
		}
        return(1);
    }

    /*  combine strings, put in first one - obsolete */
    else if( !strcmp( command, "str_add"  ) ) {
        if( nargs < 2 || args[1][0] != '$' )  do_error( "Bad str_add line" );
        exptof( args[1] );
        strcpy( stmp, gstring );
        for( i = 2; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                strcat( stmp, gstring );
            }
            else  strcat( stmp, args[i] );
        }
        register_user_var( args[1], stmp, 0 );
        return(1);
    }

    /*=========================display commands===================*/

    /*  set decimal field length  */
    else if( !strcmp( command, "decimals"  ) ) {
        if( nargs != 1 && nargs != 2 )  do_error( "Bad decimals line" );
        decimals = exptoi( args[1] );
        if( nargs == 2 )  field_width = exptoi( args[2] );
        return(1);
    }

    /*  display a labeled list of variables  */
    else if( !strcmp( command, "show"  ) ) {
        if( !nargs )  do_error( "Bad show command line" );
        for( i = 1; i <= nargs; i++ ) {
            if( gloop_active )  eval_indices( args[i] );
            val = exptof( args[i] );
            if( args[i][0] == '$' ) {
                printf( "    %s = %s   ", args[i], gstring );
            }
            else if( field_width ) {
                if( decimals >= 0 )        printf( "    %s = %*.*f", args[i], field_width, decimals, val );
                else if( decimals < -1 )   printf( "    %s = %*.*e", args[i], field_width, -decimals, val );
                else if( decimals == -1 )  printf( "    %s = %*g", args[i], field_width, val );  
            }
            else {
                if( decimals >= 0 )        printf( "    %s = %.*f", args[i], decimals, val );
                else if( decimals < -1 )   printf( "    %s = %.*e", args[i], -decimals, val );
                else if( decimals == -1 )  printf( "    %s = %g", args[i], val );  
            }

        }
        printf( "\n" );
        return(1);
    }

    /*  display a line of arguments, no spaces  */
    else if( !strcmp( command, "show_line"  ) ) {
        if( !nargs )  do_error( "Bad show_line command line" );
        for( i = 1; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                printf( "%s", gstring );
            }
            else  printf( "%s", args[i] );
        }
        printf( "\n" );
        return(1);
    }

    /*  display a field of args (no \n)  */
    else if( !strcmp( command, "show_field"  ) ) {
        if( !nargs )  do_error( "Bad show_field command line" );
        for( i = 1; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                printf( "%s", gstring );
            }
            else  printf( "%s", args[i] );
        }
        return(1);
    }

    else if( !strcmp( command, "show_nl"  ) ) {
        printf( "\n" );
        return(1);
    }


    /*-------------tables---------------*/

    else if( !strcmp( command, "set_tab"  ) ) {
        if( nargs != 1 )  do_error( "Bad set_tab args" );
        column_width = exptoi( args[1] );
    }

    /*  labels for table  */
    else if( !strcmp( command, "show_lab0"  ) ) {
        if( !nargs )  do_error( "Bad show_lab command line" );
        for( i = 1; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                strcpy( args[i], gstring );
            }
            printf( "%*s", column_width, args[i] );
        }
        return(1);
    }
    else if( !strcmp( command, "show_lab"  ) ) {
        if( !nargs )  do_error( "Bad show_lab command line" );
        for( i = 1; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                strcpy( args[i], gstring );
            }
            printf( "%*s", column_width, args[i] );
        }
        printf( "\n" );
        return(1);
    }

    /*  values for table  */
    else if( !strcmp( command, "show_tab0"  ) ) {
        if( !nargs )  do_error( "Bad show_tab0 command line" );
        for( i = 1; i <= nargs; i++ ) {
            val = exptof( args[i] );
            if( args[i][0] == '$' )  printf( "%*s", column_width, gstring );
            else if( decimals >= 0 )  printf( "%*.*f", column_width, decimals, val ); 
            else if( decimals < -1 )  printf( "%*.*e", column_width, -decimals, val );
            else if( decimals == -1 ) printf( "%*g", column_width, val );
        }
        return(1);
    }
    else if( !strcmp( command, "show_tab"  ) ) {
        if( !nargs )  do_error( "Bad show_tab command line" );
        for( i = 1; i <= nargs; i++ ) {
            val = exptof( args[i] );
            if( args[i][0] == '$' )  printf( "%*s", column_width, gstring );
            else if( decimals >= 0 )  printf( "%*.*f", column_width, decimals, val ); 
            else if( decimals < -1 )  printf( "%*.*e", column_width, -decimals, val );
            else if( decimals == -1 ) printf( "%*g", column_width, val );
        }
        printf( "\n" );
        return(1);
    }

    /*-------------data files---------------*/

    else if( !strcmp( command, "set_file_type"  ) ) {
        if( nargs != 2 )  do_error( "Bad set_file_type command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( stmp, gstring );
        }
        else  do_error( "set_file_type must take a string variable arg" );
        for( i = 0; i <= 121; i++ ) {
            if( stmp[i] == '\0' ) {
                break;
            }
            if( stmp[i] == '.' ) {
                stmp[i] = '\0';
                break;
            }
        }
        len = strlen( stmp ) + strlen( args[2] ) + 1;
        if( i == 122 )  return(0);
        strcat( stmp, "." );
        strcat( stmp, args[2] );

        stmp[len] = '\0';
        register_user_var( args[1], stmp, 0 );
        return(1);
    }

    else if( !strcmp( command, "set_delim"  ) ) {
        if( nargs != 1 )  do_error( "Bad set_delim command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        if( !strcmp( args[1], "comma" ) )  set_delim( ',' );
        if( !strcmp( args[1], "tab" ) )    set_delim( '\t' );
        if( !strcmp( args[1], "space" ) )  set_delim( ' ' );
        if( !strcmp( args[1], "slash" ) )  set_delim( '/' );
        return(1);
    }

    else if( !strcmp( command, "close_file"  ) ) {
        if( nargs != 1 )  do_error( "Bad close_file command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        close_csv_file( args[1] );
        return(1);
    }

    /*  args are file, var1, var2, etc  */
    else if( !strcmp( command, "write_var"  ) ) {
        if( nargs < 2 )  do_error( "Bad write_var command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        for( i = 1; i <= nargs; i++ ) {
            if( i > 1 )  strcpy( labels[i-1], args[i] );
        }
        strcpy( labels[i-1], "\0" );

        write_vars( args[1], labels );
        return(1);
    }


    /*  write a field of args, arg[1] is the file  */
    else if( !strcmp( command, "write_line"  ) ) {
        if( !nargs )  do_error( "Bad write_line command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        strcpy( stmp, "" );
        for( i = 2; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                strcat( stmp, gstring );
            }
            else  strcat( stmp, args[i] );
        }
        write_vars_str( args[1], stmp, 1 );
        return(1);
    }


    /*  write a field of args, arg[1] is the file  */
    else if( !strcmp( command, "write_field"  ) ) {
        if( !nargs )  do_error( "Bad write_line command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        strcpy( stmp, "" );
        for( i = 2; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                strcat( stmp, gstring );
            }
            else  strcat( stmp, args[i] );
        }
        write_vars_str( args[1], stmp, 0 );
        return(1);
    }


    /*  read a field of args, arg[1] is the file  */
    else if( !strcmp( command, "read_line"  ) ) {
        if( nargs < 2 )  do_error( "Bad read_line command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        for( i = 2; i <= nargs; i++ ) {
            strcpy( labels[i-1], args[i] );
        }
        labels[i-1][0] = '\0';

        ret = read_var0( args[1], labels );
		if( !ret )   return( ret );

        sprintf( stmp, "%d", nfields );
        register_user_var( "Nfields", stmp, 0 );
        return(1);
    }


    /*  args are file, var1, var2, etc   */
    else if( !strcmp( command, "read_var"  ) ) {
        if( nargs < 2 )  do_error( "Bad read_var command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        for( i = 2; i <= nargs; i++ ) {
            strcpy( labels[i-1], args[i] );
        }
        strcpy( labels[i-1], "\0" );

        read_vars( args[1], labels );
        return(1);
    }


    /*  args are file, label1, label2, etc.  */
    else if( !strcmp( command, "write_lab"  ) ) {
        if( nargs < 1 )  do_error( "Bad write_lab command line" );

        for( i = 1; i <= nargs; i++ ) {
            if( args[i][0] == '$' ) {
                exptof( args[i] );
                strcpy( args[i], gstring );
            }
            if( i > 1 )  strcpy( labels[i-1], args[i] );
        }

        strcpy( labels[i-1], "\0" );

        write_csv_header( args[1], labels );
        return(1);
    }


    /*  args are exp1  exp2  etc.  */
    else if( !strcmp( command, "write_dat"  ) ) {
        if( nargs < 1 )  do_error( "Bad write_dat command line" );
        for( i = 1; i <= nargs; i++ ) {
            if( !strcmp( args[i], "skip" ) )  data[i] = MISSING;
            else  data[i] = exptof( args[i] );
        }
        write_csv_data( data, nargs );
        return(1);
    }


    /*  arg is  file, optional args are labels  */
    else if( !strcmp( command, "read_lab"  ) ) {
        if( nargs < 1 )  do_error( "Bad read_lab command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        } 
        ret = read_csv_header( args[1], nargs, labels );

		if( !ret || (nargs>1 && nfields != nargs-1 ) )  return(0);
 
        sprintf( stmp, "%d", nfields );
        register_user_var( "Nfields", stmp, 0 );

		if( nargs > 1 ) {
			for( i = 1; i <= nargs - 1 ; i++ ) {
				register_user_var( args[i+1], labels[i], 0 );
			}
		}
		else  {
			for( i = 1; i <= nfields; i++ ) {
				sprintf( stmp, "$Labels[%d]", i );
				register_user_var( stmp, labels[i], 0 );
			}
		}
        return(1);
    }

    /*  args are var1  var2  ...  etc   */
    else if( !strcmp( command, "read_dat"  ) ) {

        ret = read_csv_data( nargs, labels );   /* "labels" contains the data strings  */

        sprintf( stmp, "%d", nfields );
        register_user_var( "Nfields", stmp, 0 );

        if( ret ) {
			if( nargs ) {
                for( i = 1; i <= nfields; i++ ) {
                    register_user_var( args[i], labels[i], 0 );
				}
                if( nfields == 1 && nargs > 1 && labels[1][0] != '\0' ) {
                    printf( "read dat: 1 field found, check delimiter!\n" );
				}
			}
			/*  variable field version added 4/2007 - rfs  */
			else {
                for( i = 1; i <= nfields; i++ ) {
					sprintf( stmp, "Vars[%d]", i );
                    register_user_var( stmp, labels[i], 0 );
				}
			}
        }
        return(1);
    }

    /*  arg is   file   */
    else if( !strcmp( command, "read_dat_2"  ) ) {
        if( nargs != 1 )  do_error( "Bad read_dat command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        read_csv_data_2( args[1], labels );
        return(1);
    }

    /*  arg is   file - long list version - results in Nfields, $Field[i]  */
    else if( !strcmp( command, "read_list"  ) ) {
        if( nargs != 1 )  do_error( "Bad read_list command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }

        read_list( args[1], labels );

        sprintf( stmp, "%d", nfields );
        register_user_var( "Nfields", stmp, 0 );

        return(1);
    }

    /*----------------------stat commands---------------*/

    /*--------------mult regression analysis---------------*/
    /*  arg is  file, second arg is "log" for log/log fit  */
    else if( !strcmp( command, "mult_regress"  ) ) {
        reglog = LINEAR;
        if( nargs > 2 )  do_error( "Bad mult_regress command line" );

        /*  set default mode  */
        reglog = LINEAR;
        fread = TRUE;
        
        /*  set file name  */
        if( nargs ) {
            /*  file name in string variable  */
            if( args[1][0] == '$' ) {
                exptof( args[1] );
                strcpy( args[1], gstring );
            }
            else if( nargs == 1 ) { 
                /*  no file name - use set_data  */
                if( !strcmp( args[1], "lin" ) ) {
                    reglog = LINEAR;
                    set_stat_data();
                    fread = FALSE;
                }
                else if( !strcmp( args[1], "exp" ) ) {
                    reglog = LINLOG;
                    set_stat_data();
                    fread = FALSE;
                }
                else if( !strcmp( args[1], "log" ) ) {
                    reglog = LOGLIN;
                    set_stat_data();
                    fread = FALSE;
                }
                else if( !strcmp( args[1], "pow" ) ) {
                    reglog = LOGLOG;
                    set_stat_data();
                    fread = FALSE;
                }
            }
            /*  got two args, second one must be the type  */
            if( nargs == 2 ) { 
                if( !strcmp( args[2], "lin" ) ) {
                    reglog = LINEAR;
                }
                else if( !strcmp( args[2], "exp" ) ) {
                    reglog = LINLOG;
                }
                else if( !strcmp( args[2], "log" ) ) {
                    reglog = LOGLIN;
                }
                else if( !strcmp( args[2], "pow" ) ) {
                    reglog = LOGLOG;
                }
                else  do_error( "unknown argument(s) in mult_regress command" );
            }
        }
        /*  no args - use set_data  */
        else {
            set_stat_data();
            fread = FALSE;
        }

        /*  read data from file  */
        if( fread )  read_csv_data_3( args[1], labels );

        ret = mult_regress();
        if( !ret )  do_error( "mult regress error" );

        return(1);
    }

    /*  first integer is Y var, rest are fit vars  */
    else if( !strcmp( command, "set_mr_vars"  ) ) {
        if( nargs < 2 )  do_error( "Bad set_mr_vars command line" );

        mr_args = nargs;
        nat[0] = exptoi( args[1] );
        for( i = 2; i <= nargs; i++ ) {
            nat[i-1] = exptoi( args[i] );
        }
        return(1);
    }

    /*  args are f1, f2 and tol  */
    else if( !strcmp( command, "set_mr_tols"  ) ) {
        if( nargs != 3 )  do_error( "Bad set_mr_tols command line" );

        tol1 = exptof( args[1] );
        tol2 = exptof( args[2] );
        tol3 = exptof( args[3] );

        return(1);
    }

    /*--------------factor analysis---------------*/
    else if( !strcmp( command, "factor"  ) ) {
        if( nargs > 1 )  do_error( "Bad factor command line" );
        if( nargs ) {
            if( args[1][0] == '$' ) {
                exptof( args[1] );
                strcpy( args[1], gstring );
            }
            read_csv_data_3( args[1], labels );
        }
        else {
            set_stat_data();
        }

        ret = factor();
        if( !ret )  do_error( "factor error" );

        return(1);
    }

    /*  args are f1, f2 and tol  */
    else if( !strcmp( command, "set_fa_params"  ) ) {
        if( nargs != 2 )  do_error( "Bad set_fa_params command line" );

        tol1 = exptof( args[1] );
        tol2 = exptof( args[2] );

        return(1);
    }

    /*--------------correlation analysis---------------*/
    else if( !strcmp( command, "coranal"  ) ) {
        if( nargs > 1 )  do_error( "Bad coranal command line" );
        if( nargs ) {
            if( args[1][0] == '$' ) {
                exptof( args[1] );
                strcpy( args[1], gstring );
            }
            read_csv_data_3( args[1], labels );
        }
        else {
            set_stat_data();
        }

        ret = coranal();
        if( !ret )  do_error( "coranal error" );

        return(1);
    }

    /*  arg is threshold  */
    else if( !strcmp( command, "set_ca_params"  ) ) {
        if( nargs != 1 )  do_error( "Bad set_ca_params command line" );

        tol1 = exptof( args[1] );
        set_tol = 1;

        return(1);
    }

    /*--------------cluster analysis---------------*/
    else if( !strcmp( command, "cluster"  ) ) {
        if( nargs > 1 )  do_error( "Bad cluster command line" );
        if( nargs ) {
            if( args[1][0] == '$' ) {
                exptof( args[1] );
                strcpy( args[1], gstring );
            }
            read_csv_data_3( args[1], labels );
        }
        else {
            set_stat_data();
        }

        ret = cluster();
        if( !ret )  do_error( "cluster error" );

        sprintf( stmp, "%d", Clusters );
        register_user_var( "N_clust", stmp, 0 );
        sprintf( stmp, "%.14e", Variance );
        register_user_var( "Var_clust", stmp, 0 );
        return(1);
    }

    /*  arg is sens  */
    else if( !strcmp( command, "set_cl_params"  ) ) {
        if( nargs != 1 )  do_error( "Bad set_cl_params command line" );

        tol1 = exptof( args[1] );
        set_tol = 1;

        return(1);
    }

/*--------------math commands----------------------------------------*/

    /*--------------solver---------------*/
    else if( !strcmp( command, "solve"  ) ) {
        if( nargs )  do_error( "Bad solve command line" );

        set_solve_data();

        ret = solvem( ne, xx, yy, x0 );

        for( i = 1; i <= ne; i++ ) {
            if( !ret )  stmp[0] = '\0';
            else        sprintf( stmp, "%.14e", x0[i] );
            sprintf( stmp2, "Z[%d]", i );
            register_user_var( stmp2, stmp, 0 );
        }
        return(1);
    }


    /*--------------sort---------------*/
    else if( !strcmp( command, "sort"  ) ) {
        if( nargs > 1 )  do_error( "Bad sort command line" );
        if( nargs == 1 ) {
            set_sort_data( args[1] );
        }

        else  set_sort_data( "" );

        h_sort( ne, na, xx );

        for( i = 1; i <= ne; i++ ) {
            for( j = 1; j <= na; j++ ) {
                sprintf( stmp, "%.12e", xx[i][j] );
                if( nargs == 1 ) sprintf( stmp2, "%s[%d][%d]", args[1], i, j );
                else             sprintf( stmp2, "X[%d][%d]", i, j );
                register_user_var( stmp2, stmp, 0 );
            }
        }
        return(1);
    }

/*----------------system---------------------------------------------*/

    else if( !strcmp( command, "system"  ) ) {
       if( nargs != 1 )  do_error( "Bad system command line" );
        if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( args[1], gstring );
        }
        system( args[1] );
        return(1);
    }

/*--------------period solvers----------------------------------------*/

	/*--------------period data reader---------*/
    else if( !strcmp( command, "read_pdm_data"  ) ) {
        if( nargs != 2 )  do_error( "Bad read_pdm_data command line" );

		title_lines = exptoi( args[2] );

		if( args[1][0] == '$' ) {
            exptof( args[1] );
            strcpy( stmp2, gstring );
		}
		else {
			strcpy( stmp2, args[1] );
		}

		ret = read_data_file( stmp2, title_lines );
		n1 = ne;

		if( ret ) {
			printf( " ...data read from file\n" );
			pdm_data_read = TRUE;
		}
		else {
			exit(0);
		}
	}

    /*--------------pdm2---------------*/
    else if( !strcmp( command, "pdm2"  ) ) {
        if( nargs > 2 )  do_error( "Bad pdm2 command line" );

        if( nargs ) {
            pdm_verbose = TRUE;
            if( !strcmp( args[1], "invert" ) )  invert_curve = TRUE;
            else  pdm_verbose = exptoi( args[1] );
        }
 
        if( nargs == 2 ) {
            invert_curve = FALSE;
            if( !strcmp( args[2], "invert" ) )  invert_curve = TRUE;
            else  pdm_verbose = exptoi( args[2] );
        }

        if( !pdm_data_read )  set_pdm_data();

        pdm2( ne, datx+n0, daty+n0, sig );

        for( i = 1; i <= 3; i++ ) {
            sprintf( stmp, "%.14e", thmin[i] );
            sprintf( stmp2, "Th_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );

            sprintf( stmp, "%.14e", fthmin[i] );
            sprintf( stmp2, "F_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );

            sprintf( stmp, "%.14e", signf[i] );
            sprintf( stmp2, "Signf[%d]", i );
            register_user_var( stmp2, stmp, 0 );
        }
		sprintf( stmp, "%.4f", trange );
		sprintf( stmp2, "Trange" );
		register_user_var( stmp2, stmp, 0 );


        return(1);
    }

    /*--------------pdm2b---------------*/
    else if( !strcmp( command, "pdm2b"  ) ) {
        if( nargs > 2 )  do_error( "Bad pdm2 command line" );

        if( nargs ) {
            pdm_verbose = TRUE;
            if( !strcmp( args[1], "invert" ) )  invert_curve = TRUE;
            else  pdm_verbose = exptoi( args[1] );
        }
 
        if( nargs == 2 ) {
            invert_curve = FALSE;
            if( !strcmp( args[2], "invert" ) )  invert_curve = TRUE;
            else  pdm_verbose = exptoi( args[2] );
        }

        if( !pdm_data_read )  set_pdm_data();

        pdm2b( ne, datx+n0, daty+n0, sig );

        for( i = 1; i <= 3; i++ ) {
            sprintf( stmp, "%.14e", thmin[i] );
            sprintf( stmp2, "Th_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );

            sprintf( stmp, "%.14e", fthmin[i] );
            sprintf( stmp2, "F_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );

            sprintf( stmp, "%.14e", signf[i] );
            sprintf( stmp2, "Signf[%d]", i );
            register_user_var( stmp2, stmp, 0 );
        }
		sprintf( stmp, "%.4f", trange );
		sprintf( stmp2, "Trange" );
		register_user_var( stmp2, stmp, 0 );


        return(1);
    }

    /*--------------pdm---------------*/
    else if( !strcmp( command, "pdm"  ) ) {
		error( "===pdm command has been changed to pdm2====\n" );
        if( nargs > 2 )  do_error( "Bad pdm command line" );

		if( nargs ) {
            invert_curve = FALSE;
            if( !strcmp( args[1], "invert" ) )  invert_curve = TRUE;
            else  pdm_verbose = exptoi( args[1] );
		}
 
        if( nargs == 2 ) {
            pdm_verbose = TRUE;
            if( !strcmp( args[2], "invert" ) )  invert_curve = TRUE;
            else  pdm_verbose = exptoi( args[2] );
        }

        set_pdm_data();

        pdm( ne, datx, daty, sig );

        for( i = 1; i <= 3; i++ ) {
            sprintf( stmp, "%.14e", thmin[i] );
            sprintf( stmp2, "Th_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );

            sprintf( stmp, "%.14e", fthmin[i] );
            sprintf( stmp2, "F_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );

            sprintf( stmp, "%.14e", signf[i] );
            sprintf( stmp2, "Signf[%d]", i );
            register_user_var( stmp2, stmp, 0 );
        }

        return(1);
    }

	/*  new explicit pdm parameter commands  */

    else if( !strcmp( command, "pdm_quiet"  ) ) {
		if( nargs ) {
            pdm_verbose = TRUE;
		}
		else {
            pdm_verbose = FALSE;
		}
	}
    else if( !strcmp( command, "pdm_lpoints"  ) ) {
        if( nargs != 1 )  do_error( "Bad pdm_lpoints command line" );
        lpoints = exptoi( args[1] );
		if( pdm_verbose)  printf( "PDM: points to cover freq line = %d\n", lpoints );
	}
    else if( !strcmp( command, "pdm_f_range"  ) ) {
        if( nargs != 2 )  do_error( "Bad pdm_f_range command line" );
        minf0 = exptof( args[1] );
        maxf0 = exptof( args[2] );
  		if( pdm_verbose)  printf( "PDM: freq range = %g -> %g\n", minf0, maxf0 );
	}
    else if( !strcmp( command, "pdm_invert"  ) ) {
		if( nargs ) {
            invert_curve = FALSE;
		}
		else {
            invert_curve = TRUE;
	   	    if( pdm_verbose)  printf( "PDM: invert data plot\n" );
		}
	}
    else if( !strcmp( command, "pdm_seg_dev"  ) ) {
        if( nargs != 1 )  do_error( "Bad pdm_seg_dev command line" );
        segdev = exptof( args[1] );
		if( pdm_verbose)  printf( "PDM: set segment dev = %g\n", segdev );
	}
    else if( !strcmp( command, "pdm_wide_bins"  ) ) {
        bin_10 = 0;
		if( pdm_verbose)  printf( "PDM: set wide (5/2) bins\n" );
	}
    else if( !strcmp( command, "pdm_narrow_bins"  ) ) {
        bin_10 = 1;
		if( pdm_verbose)  printf( "PDM: set narrow (10/1) bins\n" );
	}
    else if( !strcmp( command, "pdm_auto_bins"  ) ) {
        bin_10 = 2;
		if( pdm_verbose)  printf( "PDM: auto switch to 10/1 bins (at %d pts/seg)\n", SC_MAX );
	}
    else if( !strcmp( command, "pdm_bin_pts"  ) ) {
        if( nargs != 1 )  do_error( "Bad pdm_bin_pts command line" );
        bin_10 = exptoi( args[1] );
		if( bin_10 <= 2 )  do_error( "Bin pts must be greater than 2" );
		if( pdm_verbose)  printf( "PDM: switch to 10/1 bins at %d pts/seg\n", bin_10 );
	}
    else if( !strcmp( command, "pdm_subharm"  ) ) {
		if( nargs ) {
			do_subharm = FALSE;
		}
		else {
            do_subharm = TRUE;
		    if( pdm_verbose)  printf( "PDM: use subharmonic averaging\n" );
		}
	}
    else if( !strcmp( command, "pdm_linear_fit"  ) ) {
		if( nargs ) {
			do_linear_fit = FALSE;
		}
		else {
            do_linear_fit = TRUE;
			do_spline_fit = FALSE;
		    if( pdm_verbose)  printf( "PDM: use linear interp instead of bin means\n" );
		}
	}
    else if( !strcmp( command, "pdm_spline_fit"  ) ) {
		if( nargs ) {
			do_spline_fit = FALSE;
		}
		else {
            do_spline_fit = TRUE;
			do_linear_fit = FALSE;
		    if( pdm_verbose)  printf( "PDM: use Bspline interp instead of bin means\n" );
		}
	}
    else if( !strcmp( command, "pdm_debug"  ) ) {
		if( nargs ) {
			pdm_debug = FALSE;
		}
		else {
            pdm_debug = TRUE;
		    if( pdm_verbose)  printf( "PDM: turn on debug mode\n" );
		}
	}
    else if( !strcmp( command, "pdm_beta_range"  ) ) {
        if( nargs < 2 || nargs > 3 )  error( "Bad pdm_beta_range command line" );
        beta_min = exptof( args[1] );
        beta_max = exptof( args[2] );
		do_beta_scan = TRUE;
		if( pdm_verbose)  printf( "PDM: beta range = %g - %g\n", beta_min, beta_max );
		if( nargs == 3 ) {
			nb0 = exptoi( args[3] );
		}

	}
    else if( !strcmp( command, "pdm_beta_scale"  ) ) {
        if( nargs != 1 )  do_error( "Bad pdm_beta_scale command line" );
        beta_scale = exptof( args[1] );
		if( pdm_verbose)  printf( "PDM: set beta scale = %g\n", beta_scale );
	}
    else if( !strcmp( command, "pdm_monte_carlo"  ) ) {
        do_non_par = TRUE;
		if( !nargs ) {
			do_dist = TRUE;
			nb0 = 250;
		}
		else {
			nb0 = exptoi( args[1] );
			if( !nb0 )  do_non_par = FALSE;
		}
        if( pdm_verbose && nb0)  printf( "PDM: Monte Carlo analyses = %d\n", nb0 );
	}
    else if( !strcmp( command, "pdm_no_sig"  ) ) {
		if( nargs ) {
			do_sigmas = TRUE;
		}
		else {
            do_sigmas = FALSE;
		    if( pdm_verbose)  printf( "PDM: ignore sigma data\n" );
		}
	}
    else if( !strcmp( command, "pdm_phase_shift"  ) ) {
		if( nargs != 1 ) {
			error( "pdm_phase shift needs a phase shift arg" );
		}
		else {
           phase_shift = exptof( args[1] );
		}
	}
    else if( !strcmp( command, "pdm_data_range"  ) ) {
		/*  Use this command for Blazhko and other variability  */
		if( nargs != 2 ) {
			error( "bad pdm_data_range command - expects n0  n1" );
		}
		else {
           n0 = exptoi( args[1] );
		   n1 = exptoi( args[2] );
		   ne = n1-n0+1;
		   printf( "Data range set to %d -> %d\n", n0, n1 );
		   /*  apply offset  */
		   n0--;
		   n1--;
		}
	}
    else if( !strcmp( command, "pdm_prefix"  ) ) {
		if( nargs != 1 ) {
			error( "bad pdm_prefix command - expects run label" );
		}
		else {
           strcpy( prefix, args[1] );
		   printf( "Prefix set to %s \n", prefix );
		}
	}

	/* old form shortcut commands  */

    /*  args are line_points, minf, maxf, seg_dev  */
    else if( !strcmp( command, "set_per_params"  ) ) {
        if( nargs < 1 || nargs > 4 )  do_error( "Bad set_per_params command line" );

        lpoints = exptoi( args[1] );
        if( nargs >= 3 ) {
            minf0 = exptof( args[2] );
            maxf0 = exptof( args[3] );
        }
        if( nargs >= 4 ) {
            segdev = exptoi( args[4] );
        }
        return(1);
    }


    /*  args are bin_10, no sub avg, no curve fit, write distributions   */
    else if( !strcmp( command, "set_per_opts"  ) ) {
        if( nargs < 1 || nargs > 4 )  do_error( "Bad set_per_opts command line" );

        if( nargs >= 1 ) {
            bin_10 = exptoi( args[1] );
            printf( "\n  Force 10/1 bins = %d\n", bin_10 );
        }
        if( nargs >= 2 ) {
            do_subharm = !exptoi( args[2] );
            printf( "  Subharmonic Averaging = %d\n", do_subharm );
        }
        if( nargs >= 3 ) {
            do_linear_fit = !exptoi( args[3] );
            printf( "  Curve fitting = %d\n", do_linear_fit );
        }
        if( nargs >= 4 ) {
            do_dist = exptoi( args[4] );
            printf( "  Write Distributions (sig.csv, theta_dist.csv) = %d\n", do_dist );
        }
        return(1);
    }


    /*--------------lomb---------------*/

	/*  new explicit lomb parameter commands  */

    else if( !strcmp( command, "lomb_ofac"  ) ) {
        if( nargs != 1 )  do_error( "Bad lomb_ofac command line" );
        lpoints = exptoi( args[1] );
	}
    else if( !strcmp( command, "lomb_max_f"  ) ) {
        if( nargs != 2 )  do_error( "Bad lomb_max_f command line" );
        maxf0 = exptof( args[1] );
	}
    else if( !strcmp( command, "lomb_quiet"  ) ) {
        pdm_verbose = FALSE;
	}
    else if( !strcmp( command, "lomb_verbose"  ) ) {
        pdm_verbose = TRUE;
	}
    else if( !strcmp( command, "lomb_invert"  ) ) {
        invert_curve = TRUE;
	}
    else if( !strcmp( command, "lomb_normal"  ) ) {
        invert_curve = FALSE;
	}
    else if( !strcmp( command, "lomb_amp_units"  ) ) {
        amp_units = TRUE;
		psd_units = FALSE;
	}
    else if( !strcmp( command, "lomb_psd_units"  ) ) {
        psd_units = TRUE;
		amp_units = FALSE;
	}
    else if( !strcmp( command, "lomb_normal_units"  ) ) {
        psd_units = FALSE;
		amp_units = FALSE;
	}
    else if( !strcmp( command, "lomb"  ) ) {
        if( nargs > 2 )  do_error( "Bad lomb command line" );
        if( nargs == 1 && !strcmp( "invert", args[1] ) )  invert_curve = TRUE;
        if( nargs == 2 && !strcmp( "invert", args[2] ) )  invert_curve = TRUE;
        if( nargs == 1 && !strcmp( "amp", args[1] ) )  amp_units = TRUE;
        if( nargs == 2 && !strcmp( "amp", args[2] ) )  amp_units = TRUE;
        if( nargs == 1 && !strcmp( "psd", args[1] ) )  psd_units = TRUE;
        if( nargs == 2 && !strcmp( "psd", args[2] ) )  psd_units = TRUE;

        set_lomb_data();

        lomb( ne, datx, daty );
/*
        for( i = 1; i <= 3; i++ ) {
            sprintf( stmp, "%.14e", thmin[i] );
            sprintf( stmp2, "Th_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );

            sprintf( stmp, "%.14e", fthmin[i] );
            sprintf( stmp2, "F_min[%d]", i );
            register_user_var( stmp2, stmp, 0 );
        }
*/
        return(1);
    }

    /*--------------end of list-------*/
    else {
        sprintf( stmp, "Unknown command: <%s>", command );
        do_error( stmp );
    }

    return(0);
}


int set_pdm_data( )
{
    int i;
    double tmp;

    i = exptoi( "N" );
    if( !i )  do_error( "pdm:  N = 0" );
    else      ne = i;
    if( ne > MAXDAT ) {
        printf( "PDM: too many data points, set to %d\n", MAXDAT );
        ne = MAXDAT;
    }

    for( i = 1; i <= ne; i++ ) {
        sprintf( stmp, "Ydat[%d]", i );
        tmp = exptof( stmp );
        daty[i] = tmp;
    }
    for( i = 1; i <= ne; i++ ) {
        sprintf( stmp, "Xdat[%d]", i );
        tmp = exptof( stmp );
        datx[i] = tmp;
    }
    for( i = 1; i <= ne; i++ ) {
        sprintf( stmp, "Sdat[%d]", i );
        tmp = exptof( stmp );
        sig[i] = tmp;
    }

    return(1);
}


int set_lomb_data( )
{
    int i;
    double tmp;

    i = exptoi( "N" );
    if( !i )  do_error( "lomb:  N = 0" );
    else      ne = i;
    if( ne > MAXDATL ) {
        printf( "LOMB: too many data points, set to %d\n", MAXDATL );
        ne = MAXDATL;
    }
    for( i = 1; i <= ne; i++ ) {
        sprintf( stmp, "Ydat[%d]", i );
        tmp = exptof( stmp );
        daty[i] = tmp;
    }
    for( i = 1; i <= ne; i++ ) {
        sprintf( stmp, "Xdat[%d]", i );
        tmp = exptof( stmp );
        datx[i] = tmp;
    }

    return(1);
}


/*  read space separated or csv file  */

int read_data_file( char *file, int title_lines ) {
    FILE *fi;
    char buffer[121];
    int i, j, ret, field;

    /*  read in a data file  */
    /*  format here is  X  Y  [Sig]  */

    fi = fopen( file, "r" );
    if( !fi ) {
        printf( "Unable to open file file %s\n", file );
        return(0);
    }

    printf( "Reading Data File - %s\n", file );
    if( title_lines ) {
        for( i = 1; i <= title_lines; i++ ) {
            ret = fgetline( fi, buffer, 120 );
            if( ret == EOF )  {
                printf( "Error reading file %s\n", file );
                return(0);
            }
            printf( "%s\n", buffer );
        }
    }

    for( i = 1; i <= MAXDAT; i++ ) {
        field = 1;
        ret = fgetline( fi, buffer, 120 );
        if( !ret )  break;
        for( j = 0; j <= 120; j++ ) {
            if( buffer[j] == ' ' || buffer[j] == ',')  continue;
            if( field == 1 ) {
                datx[i] = atof( &buffer[j] );
				if( datx[i] == 0. )  break;
                for( ; j <= 10000, buffer[j] != ' ' && buffer[j] != ','; j++ );
                field = 2;
                continue;
            }
            if( field == 2 ) {
                daty[i] = atof( &buffer[j] );
                for( ; j <= 10000, buffer[j] != ' ' && buffer[j] != ',' &&  buffer[j] != '\0'; j++ );
                if( buffer[j] == '\0' ) {
                    sig[i] = 0.;
                    break;
                }
                field = 3;
                continue;
            }
            if( field == 3 ) {
                sig[i] = atof( &buffer[j] );
				if( sig[i] > 1 || sig[i] < 0. ) {
					printf( "Error in sigma field, record %d, X=%g, Y=%g, Sig=%g\n", i, datx[i], daty[i], sig[i] );
					getchar();
					error( "" );
				}
                break;
            }
        }
        if( i <= 21 )	printf( "%d, %18.12g, %18.12g, %g\n", i, datx[i], daty[i], sig[i] );
    }
    ne = i - 1;
    sprintf( stmp, "%d", ne );
    register_user_var( "N", stmp, 0 );
    if( i == MAXDAT+1 ) {
        printf( "Warning - max points read from file\n" );
        return(1);
    }
    return(1);
}
