/*  parse.c -- read and process STRAN input files  */
/*  $Id:$  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  this is the module that reads and processes the run input  */

/*--------------------------------------------------------
read_input_file() - open and read the file
    called by main()
    calls do_line(), process_params(), process_model()
do_line() - crack a line of input
    called by read_input_file()
    calls fgetstr(), item()
item() - extract the nth item from a string
    called by do_line()
    >>>>contains parsing rules<<<<
jump_to()  -  find a command, used internally

----------------------------------------------------------*/

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <ctype.h>

#define EXTERN extern
#include "s_tran.h"
                                                 /*  input params  */

#define MAX_LOOP    150                         /*  size of loop buffer  */
#define MAX_IFS      10                         /*  nested "ifs"  */


/*=========private function list=======================================*/

static int do_line( FILE *fp, char *command, int *pnargs, char args[MAX_ARGS+1][FIELD_LEN+1],
            int *pfile_line, int loop_i_active, char loop_buffer[MAX_LOOP+1][LINE_LEN+1],
            int *ploop_line  );
static int jump_to( FILE *fp, char command1[FIELD_LEN+1], char command2[FIELD_LEN+1],
                   char command3[FIELD_LEN+1], int check_depth, int *pfile_line,
                   int *ploop_i_active, int *ploop_j_active, int *ploop_k_active,
                   char loop_buffer[MAX_LOOP+1][LINE_LEN+1], int *ploop_line, int *pif_depth);

/*===========private working variables===================================*/

static int buffer_ptr, g_nargs, nocount, jump;
static char g_command[FIELD_LEN+1], g_args[MAX_ARGS+1][FIELD_LEN+1];
static char g_line_buffer[LINE_LEN+1];
static LOGICAL comment_active;
static int comment_line;

/*===========eval needs loop indices====================================*/

double gloop_i_index, gloop_j_index, gloop_k_index;
int g_level, gloop_active;

/*===========function identifiers========================================*/

char g_file[256], g_routine[126];

/*========================= input parsers ========================================*/
/*  args are the file name to open and read, and the function to handle the results  */
/*  returns 1 if ok, 0 if no valid commands are found, -1 if the file is not found  */

/*  this function may be called several times to scan for different command sets  */


int read_input_file( char* file, int (*inp_handler)(char *command, int nargs, 
                    char args[MAX_ARGS+1][FIELD_LEN+1]), char *call_label ) 
{
    int i, j, k, nargs, ret, depth0, again, file_line, call_flag, rpt;
    char command[STRING_LEN+1], args[MAX_ARGS+1][FIELD_LEN+1];
    FILE *fp;
    static int level, break_loop;
    char line_buffer[LINE_LEN+1], command2[STRING_LEN+1], r_file[LINE_LEN+1];
    char str_tmp[STRING_LEN+1];

    /*-----"if" variables ----------------------------*/

    int if_active, if_depth;

    /*---- LOOP PARAMETERS---------------------------*/

    double loop_i_index=0., loop_j_index=0., loop_k_index=0.;
    LOGICAL loop_i_active=0, loop_j_active=0, loop_k_active=0;
    
    /*  these are the positions of the loop in the buffer  */
    int loop_i_first=0, loop_j_first=0, loop_k_first=0;
    int loop_i_last=0, loop_j_last=0, loop_k_last=0;
    
    /*  these are the loop index parameters  */
    double loop_i_begin=0., loop_i_end=0., loop_i_incr=0.;
    double loop_j_begin=0., loop_j_end=0., loop_j_incr=0.;
    double loop_k_begin=0., loop_k_end=0., loop_k_incr=0.;

    /*  these are the loop buffer parameters  */
    int loop_line=0;
    char loop_buffer[MAX_LOOP+1][LINE_LEN+1];

    /*---- END LOOP PARAMETERS-----------------------*/

    if( debug ) printf( "...read_input_file %s\n", file );

    if( file == NULL || file[0] == '\0' ) {
        printf( "read_input_file - null file name encountered" );
		data_error = TRUE;
		return(-1);
    }

    fp = fopen( file, "r" );
    if( !fp )  {
        printf( "read_input_file: WARNING:  cannot open file %s\n", file );
		data_error = TRUE;
        return( -1 );
    }
                                /*  init the file pointer, recursion level  */
    level++;
    g_level = level;
    file_line = 0;
    if_depth = 0;
    if_active = 0;
    call_flag = 0;
                                /*  set function ID  */
    strcpy( g_file, file );
    if( call_label[0] != '\0' )  strcpy( g_routine, call_label );
    else                         strcpy( g_routine, "main" );

                                /*  function call case  */
    if( call_label[0] != '\0' ) {
        call_flag = 1;
        jump_to( fp, call_label, "", "", 0, &file_line, &loop_i_active, &loop_j_active,
            &loop_k_active, loop_buffer, &loop_line, &if_depth );
    }

                                /*  main read data loop  */

    for( i = 1; i <= MAX_COMMANDS; i++ ) {

                                /*  set globals for eval use  */

        gloop_i_index = loop_i_index;
        gloop_j_index = loop_j_index;
        gloop_k_index = loop_k_index;
        gloop_active = loop_i_active;

                                /*  read next line in file  */

        ret = do_line( fp, command, &nargs, args, &file_line, loop_i_active, loop_buffer, &loop_line );
        
                                /*  catch simple "if" commands here  */

        if( !strcmp( command, "if" ) && nargs > 1 ) {
			if( exptof( args[1] ) ) {
				strcpy( command, args[2] );
				for( j = 3; j <= nargs; j++ ) {
					strcpy( args[j-2], args[j] );
				}
				nargs -= 2;
				goto noif;
			}
			else {
				goto last_actions;
			}
		}
noif:

        /*=======================exit options===============================*/

                                /*  normal EOF return  */
        if( !ret ) {            
            fclose( fp );
            if( comment_active ) {
                sprintf( stmp, "File ends in comment...*/ missing, check line %d", comment_line );
                do_error( stmp );
            }
            if( if_depth ) {
                sprintf( stmp, "IF error, depth=%d, probable 'end_if' missing or misplaced", if_depth );
                do_error( stmp );
            }
            cleanup_vars();
            level--;
            g_level = level;
            return(1);
        }
                                /*  optional "end" return - just like an EOF */

        if( !strcmp( command, "end" ) ) {
            if( nargs )  do_error( "Bad end command line" );
            fclose( fp );
            if( if_depth ) {
                sprintf( stmp, "IF error, depth=%d, probable 'end_if' missing or misplaced", if_depth );
                do_error( stmp );
            }
            cleanup_vars();
            level--;
            g_level = level;
            return(1);
        }
                                /*  "exit" = terminate  */

        if( !strcmp( command, "exit" ) ) {
            if( nargs ) {
				
				/*  combine multiple string args  */
				if( nargs > 1 ) {
					for( j = 1; j <= nargs; j++ ) {
						if( args[j][0] == '$' ) {
							exptof( args[j] );
							strcpy( args[j], gstring );
						}
						if( j > 1 ) {
							strcat( str_tmp, args[j] );
						}
						else {
							strcpy( str_tmp, args[1] );
						}
					}
				}
				else if( args[1][0] == '$' ) {
                    exptof( args[1] );
                    strcpy( str_tmp, gstring );
                }
                else  strcpy( str_tmp, args[1] );

                printf( "\n%s\n", str_tmp );
            }
            do_exit(5);
            return(1);
        }
        /*===================end exit options===============================*/

                                /*  skip non-commands  */

        if( ret == NOOP )  goto  last_actions;

                                /*  debug output  */

        if( DEBUG_IF || DEBUG_LOOP || debug )  {
            printf( " [%d]Line %d: %s ", level, file_line, command );
            if( nargs ) {
                printf( "= " );
                for( i = 1; i <= nargs; i++ ) {
                    printf( "%s  ", args[i] );
                }
            }
            printf( "\n" );
            if( loop_i_active )  printf( "    loop line=%d, ind i=%g, ind j=%g  ind k=%g\n", loop_line-1, loop_i_index, loop_j_index, loop_k_index );
        }
        if( single_step ) getchar();

                                /*  subroutine calls handled here  */

        if( !strcmp( command, "call" ) ) {
            if( nargs != 1 && nargs != 2 )   do_error( "Bad call line" );
            if( args[1][0] == '$' ) {
                exptof( args[1] );
                strcpy( args[1], gstring );
            }
            if( nargs == 2 ) {
                if( args[2][0] == '$' ) {
                    exptof( args[2] );
                    strcpy( args[2], gstring );
                }
                if( args[2][0] != '\\' && args[2][1] != ':' )  sprintf( r_file, "%s%s", path_name, args[2] );
                else  strcpy( r_file, args[2] );
                ret = read_input_file( r_file, inp_handler, args[1] );
				if( ret == -1 ) {
	            	data_error = TRUE;
					continue;
				}
                //continue;         ---  fixed 8/1/05
            }
            else {
				ret = read_input_file( file, inp_handler, args[1] );
				if( ret == -1 ) {
	            	data_error = TRUE;
					continue;
				}
			}
            
            /*  set function ID  */
            strcpy( g_file, file );
            if( call_label[0] != '\0' )  strcpy( g_routine, call_label );
            else                         strcpy( g_routine, "main" );

            continue;
        }

        if( !strcmp( command, "return" ) ) {
            fclose( fp );
            cleanup_vars();
            level--;
            g_level = level;
            return(1);
        }
                                /*  handle recursive file reads here  */

        if( !strcmp( command, "read_data" ) || !strcmp( command, "read_file" )) {
            if( nargs != 1 )  do_error( "Bad read_data line" );
            if( args[1][0] == '$' ) {
                exptof( args[1] );
                strcpy( args[1], gstring );
            }
            printf( "====Read data file = %s====\n", args[1] );
            if( args[1][0] != '\\' && args[1][1] != ':' )  sprintf( r_file, "%s%s", path_name, args[1] );
            else  strcpy( r_file, args[1] );
            ret = read_input_file( r_file, inp_handler, "" );
			if( ret == -1 ) {
	            data_error = TRUE;
				continue;
			}

            /*  set function ID  */
            strcpy( g_file, file );
            if( call_label[0] != '\0' )  strcpy( g_routine, call_label );
            else                         strcpy( g_routine, "main" );

            continue;
        }
                                /*  catch "goto" commands here  */

        if( !strcmp( command, "goto" ) ) {
            if( nargs != 1  )  do_error( "Bad  goto  line" );
            depth0 = if_depth;
            jump_to( fp, args[1], "", "", 0, &file_line, &loop_i_active, &loop_j_active,
                &loop_k_active, loop_buffer, &loop_line, &if_depth );

                /*  process target line  */
            nargs = g_nargs;
            strcpy( command, g_command );
            for( j = 1; j <= nargs; j++ ) {
                strcpy( args[j], g_args[j] );
            }
            if( if_depth > depth0 )  do_error( "goto error, illegal jump into an if clause" );
        }
                                /*  skip labels  */

        if( command[strlen( command ) - 1] == ':' )  goto last_actions;

                                /*  catch user variable defs here  */

        if( ((command[0] >= 'A') && (command[0] <= 'Z')) || command[0] == '$' ) {
            if( !nargs ) {
                sprintf( stmp, "Bad user variable def, no rhs = %s", command );
                do_error( stmp );
            }
            if( command[0] != '$' && nargs != 1 ) {
                sprintf( stmp, "Bad user variable def (no spaces!) = %s", command );
                do_error( stmp );
            }
            strcpy( str_tmp, args[1] );

            /*  combine multiple string args  */
            if( command[0] == '$' && nargs > 1 ) {
                for( j = 1; j <= nargs; j++ ) {
                    if( args[j][0] == '$' ) {
                        exptof( args[j] );
                        strcpy( args[j], gstring );
                    }
                    if( j > 1 ) {
                        strcat( str_tmp, args[j] );
                    }
                    else {
                        strcpy( str_tmp, args[1] );
                    }
                }
            }

            ret = register_user_var( command, str_tmp, 0 );
            goto last_actions;
        }

        if( !strcmp( command, "init_var" ) ) {
            if( !nargs || nargs > 2 )  do_error( "Bad  init_user_var  line" );
            if( nargs == 2 )  ret = register_user_var( args[1], args[2], 1 );
            else              ret = register_user_var( args[1], "0", 1 );;
            goto last_actions;
        }
                                /*  catch "if" commands here  */

        if( !strcmp( command, "if" ) ) {
            if( nargs != 1 )  do_error( "Bad if command" );

            if_depth++;
            if_active = TRUE;
            if( DEBUG_IF )  printf( "===>IF encountered, depth = %d\n", if_depth );
            
                                                /*  branch on test clause  */
            if( !exptof( args[1] ) ) {
                do {
                    ret = jump_to( fp, "else_if", "else", "end_if", 1, &file_line,
                        &loop_i_active, &loop_j_active, &loop_k_active, loop_buffer,
                        &loop_line, &if_depth );
                        /*  end_if case  */
                    if( ret == 3 ) {
                        if_depth--;
                        if( !if_depth ) if_active = FALSE;
                        if( DEBUG_IF )  printf( "===>END_IF, line %d depth = %d\n", loop_line, if_depth );
                        again = 0;
                    }
                                /*  else_if case  */
                    else if( ret == 1 ) {
                        if( g_nargs != 1  )  do_error( "Bad  else_if  line" );
                        /*  reevaluate the test field with jump false  */
                        ret = item( 2, g_args[1], FIELD_LEN, g_line_buffer, LINE_LEN );
                        again = !exptof( g_args[1] );
                    }
                                /*  else  case  */
                    else {
                        if( g_nargs  ) {
                            if( !strcmp( g_args[1], "if" ) )  do_error( "else if  should be else_if" );
                            do_error( "bad  else  line" );
                        }
                        again = 0;
                    }
                }
                while( again );
            }
            goto last_actions;
        }
                                                /*  end_if calc (end of branch)  */

        if( !strcmp( command, "else_if" ) || !strcmp( command, "else" )  || !strcmp( command, "end_if" ) ) {
            if( !if_active )  do_error( "Orphan  else_if, else or end_if  encountered" );
            if( !strcmp( command, "else_if" ) || !strcmp( command, "else" ) ) {
                jump_to( fp, "end_if", "", "", 1, &file_line, &loop_i_active,
                    &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
            }
            if_depth--;
            if( DEBUG_IF )  printf( "===>END_IF encountered, line %d depth = %d\n", loop_line, if_depth );
            if( !if_depth ) if_active = FALSE;
            goto last_actions;
        }
                                /*  catch loop commands here  */

        if( !strcmp( command, "begin_loop_i" ) || !strcmp( command, "do_i" ) || !strcmp( command, "for_i" ) ) {
            if( nargs != 2 && nargs != 3  )  do_error( "Bad begin_loop_i line" );

            /*===============init loop i================================================*/

            if( loop_i_active )  do_error( "Nested I-Loops not allowed" );
            
            loop_i_begin = exptof( args[1] );
            loop_i_end = exptof( args[2] );
            if( nargs == 3 )  loop_i_incr = exptof( args[3] );
            else              loop_i_incr = 1.;
            
            loop_i_first = 1;
            
            if( !loop_i_incr )  do_error( "Zero increment for loop i" );
            
            /*  check for premature finish condition  */
            /*  also skip if not a build pass         */
            if( (loop_i_incr > 0. && loop_i_end < loop_i_begin) ||
                (loop_i_incr < 0. && loop_i_end > loop_i_begin) ) {
                if( debug )  printf( "***Warning: loop_i end condition satisfied on init\n" );
                
                /*  skip to end of i loop  */
                jump_to( fp, "end_loop_i", "end_i", "", 0, &file_line, &loop_i_active,
                    &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
            }
            else {
                /*  load loop into buffer, init indices  */
                
                /*  loop_i_first points to the line after the begin_loop          */
                /*  loop_i_last points to the  end_loop = last line in buffer     */
                
                jump = TRUE;
                for( j = 1; j <= MAX_LOOP; j++ ) {
					/*  this do loop skips blank lines and comments  */
					do {
						rpt = FALSE;
                        ret = fgetstr( fp, line_buffer, LINE_LEN );  /*  read the line  */
						if( !line_buffer[0] ) {                      /*  blank  */
							rpt = TRUE;
						    continue;
						}
						for( k = 0; k <= LINE_LEN; k++ ) {           /*  simple comment?  */
							if( line_buffer[k] == ' ' )  continue;
							else if( line_buffer[k] == '#' || (line_buffer[k] == '/' && line_buffer[k+1] == '/')) {
								rpt = TRUE;
								break;
							}
							else  break;
						}
					}  while( rpt );
                    if( ret == EOF )  break;
                    strncpy( loop_buffer[j], line_buffer, LINE_LEN );
                    if( DEBUG_LOOP )  printf( "-->Loop store line %d: %s\n", j, line_buffer );
                    ret = item( 1, command2, FIELD_LEN, line_buffer, LINE_LEN );
                    if( !strcmp( command2, "end_loop_i" ) || !strcmp( command2, "end_i" ) ) {
                        loop_i_index = loop_i_begin;
                        loop_line = loop_i_first;
                        loop_i_last = j;
                        loop_i_active = TRUE;
                        if( DEBUG_LOOP )  printf( "  -->Loop i setup %g->%g (%g)\n", loop_i_begin, loop_i_end, loop_i_incr );
                        goto outi;
                    }
                }
				if( j == MAX_LOOP+1 ) {
					printf( "\n--->Current loop starts approx at line %d\n", i );
					printf( "    Current line = %s", line_buffer );    
					if( loop_k_active )       do_error( "K LOOP too long...buffer exceeded" );
					else if( loop_j_active )  do_error( "J LOOP too long...buffer exceeded" );
					else                      do_error( "I LOOP too long...buffer exceeded" );
				}
                do_error( "...end_loop_i  command not found\n" );
            }
outi:
            jump = FALSE;
            continue;
            /*===============end init loop i============================================*/
        }
        if( !strcmp( command, "begin_loop_j" ) || !strcmp( command, "do_j" ) || !strcmp( command, "for_j" ) ) {
            if( nargs != 2 && nargs != 3  )  do_error( "Bad begin_loop_j line" );
            if( !loop_i_active )  do_error( "Loop error: loop j not nested in loop i" );
            if( loop_j_active )  do_error( "Nested J-Loops not allowed" );

            /*===============init loop j================================================*/

            loop_j_begin = exptof( args[1] );
            loop_j_end = exptof( args[2] );
            if( nargs == 3 )  loop_j_incr = exptof( args[3] );
            else              loop_j_incr = 1.;
            
            loop_j_first = loop_line;
            
            if( !loop_j_incr )  do_error( "Zero increment for loop j" );
            
            /*  skip to end of loop  */
            nocount = TRUE;
            ret = jump_to( fp, "end_loop_j", "end_j", "", 0, &file_line, &loop_i_active,
                &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
            nocount = FALSE;
            
            /*  check for premature finish condition  */
            if( (loop_j_incr > 0. && loop_j_end < loop_j_begin) ||
                (loop_j_incr < 0. && loop_j_end > loop_j_begin) ) {
                if( debug )  printf( "***Warning: loop_j end condition satisfied on init\n" );
                loop_j_active = FALSE;
                continue;;
            }
            else {
                loop_j_index = loop_j_begin;
                loop_j_last = loop_line - 1;
                loop_line = loop_j_first;
                loop_j_active = TRUE;      
            }
            if( DEBUG_LOOP )  printf( "  -->Loop j setup %g->%g (%g)  lines %d-%d\n", loop_j_begin, loop_j_end, loop_j_incr, loop_j_first, loop_j_last );

            /*===============end init loop j============================================*/

            continue;
        }
        if( !strcmp( command, "begin_loop_k" ) || !strcmp( command, "do_k" ) || !strcmp( command, "for_k" ) ) {
            if( nargs != 2 && nargs != 3  )  do_error( "Bad begin_loop_k line" );
            if( !loop_i_active || !loop_j_active )  do_error( "Loop error: loop k not nested in loops i and j" );
            if( loop_k_active )  do_error( "Nested K-Loops not allowed" );

            /*===============init loop k================================================*/

            loop_k_begin = exptof( args[1] );
            loop_k_end = exptof( args[2] );
            if( nargs == 3 )  loop_k_incr = exptof( args[3] );
            else              loop_k_incr = 1.;
            
            loop_k_first = loop_line;
            
            if( !loop_k_incr )  do_error( "Zero increment for loop k" );
            
            /*  skip to end of loop, always needed!  */
            nocount = TRUE;
            ret = jump_to( fp, "end_loop_k", "end_k", "", 0, &file_line, &loop_i_active,
                &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
            nocount = FALSE;
            
            /*  check for premature finish condition  */
            if( (loop_k_incr > 0. && loop_k_end < loop_k_begin) ||
                (loop_k_incr < 0. && loop_k_end > loop_k_begin) ) {
                if( debug )  printf( "***Warning: loop_k end condition satisfied on init\n" );
                continue;
            }
            else {
                loop_k_index = loop_k_begin;
                loop_k_last = loop_line - 1;
                loop_line = loop_k_first;
                loop_k_active = TRUE;
            }
            if( DEBUG_LOOP )  printf( "  -->Loop k setup %g->%g (%g)  lines %d-%d\n", loop_k_begin, loop_k_end, loop_k_incr, loop_k_first, loop_k_last );

            /*===============end init loop k============================================*/

            continue;
        }

        /*  check for misplaced end_loops  */

        if( !strcmp( command, "end_loop_i" ) || !strcmp( command, "end_i" ) ) {
            if( !loop_i_active  )  do_error( "Orphan end_loop_i line" );
            else  goto last_actions;
        }
        if( !strcmp( command, "end_loop_j" ) || !strcmp( command, "end_j" ) ) {
            if( !loop_j_active  )  do_error( "Orphan end_loop_j line" );
            else  goto last_actions;
        }
        if( !strcmp( command, "end_loop_k" ) || !strcmp( command, "end_k" ) ) {
            if( !loop_k_active  )  do_error( "Orphan end_loop_k line" );
            else  goto last_actions;
        }
                               /*  catch loop break commands here  */

        if( !strcmp( command, "break" ) || !strcmp( command, "break_if") ) {
            if( nargs > 1  )  do_error( "Bad break line" );
            if( !nargs || exptof( args[1] ) != 0 )  {
                if( loop_k_active ) {
                    jump_to( fp, "end_loop_k", "end_k", "", 0, &file_line, &loop_i_active,
                        &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
                    break_loop = TRUE;
                }
                else if( loop_j_active ) {
                    jump_to( fp, "end_loop_j", "end_j", "", 0, &file_line, &loop_i_active,
                        &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
                    break_loop = TRUE;
                }
                else  {
                    jump_to( fp, "end_loop_i", "end_i", "", 0, &file_line, &loop_i_active,
                        &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
                    break_loop = TRUE;
                }
            }
            goto last_actions;
        }
                               /*  catch loop continue commands here  */

        if( !strcmp( command, "continue" ) || !strcmp( command, "continue_if" ) ) {
            if( nargs > 1  )  do_error( "Bad break line" );
            if( !nargs || exptof( args[1] ) != 0 )  {
                if( loop_k_active ) {
                    jump_to( fp, "end_loop_k", "end_k", "", 0, &file_line, &loop_i_active,
                        &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
                }
                else if( loop_j_active ) {
                    jump_to( fp, "end_loop_j", "end_j", "", 0, &file_line, &loop_i_active,
                        &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
                }
                else  {
                    jump_to( fp, "end_loop_i", "end_i", "", 0, &file_line, &loop_i_active,
                        &loop_j_active, &loop_k_active, loop_buffer, &loop_line, &if_depth );
                }
            }
            goto last_actions;
        }
                               /*  pass command to command handler here  */

        ret = (*inp_handler)( command, nargs, args );

                               /*  advance loop indices here  */
last_actions:
        if( loop_k_active ) {
            if( break_loop ) {
                if( DEBUG_LOOP )  printf( "-->exit loop k\n" );
                loop_k_active = FALSE;
                break_loop = FALSE;
            }
            else if( loop_line > loop_k_last ) {
                loop_k_index += loop_k_incr;
                if( (loop_k_incr > 0 && loop_k_index > loop_k_end) ||
                    (loop_k_incr < 0 && loop_k_index < loop_k_end) ) {
                    if( DEBUG_LOOP )  printf( "-->exit loop k\n" );
                    loop_k_active = FALSE;
                }
                else {
                    loop_line = loop_k_first;
                    file_line -= (loop_k_last - loop_k_first + 1);
                }
            }
        }
        else if( loop_j_active ) {
            if( break_loop ) {
                if( DEBUG_LOOP )  printf( "-->exit loop j\n" );
                loop_j_active = FALSE;
                break_loop = FALSE;
            }
            else if( loop_line > loop_j_last ) {
                loop_j_index += loop_j_incr;
                if( (loop_j_incr > 0 && loop_j_index > loop_j_end) ||
                    (loop_j_incr < 0 && loop_j_index < loop_j_end) ) {
                    if( DEBUG_LOOP )  printf( "-->exit loop j\n" );
                    loop_j_active = FALSE;
                }
                else {
                    loop_line = loop_j_first;
                    file_line -= (loop_j_last - loop_j_first + 1);
                }
            }
        }
        else if( loop_i_active ) {
            if( break_loop ) {
                if( DEBUG_LOOP )  printf( "-->exit loop i\n" );
                loop_i_active = FALSE;
                break_loop = FALSE;
            }
            else if( loop_line > loop_i_last ) {
                loop_i_index += loop_i_incr;
                if( (loop_i_incr > 0 && loop_i_index > loop_i_end) ||
                    (loop_i_incr < 0 && loop_i_index < loop_i_end) ) {
                    if( DEBUG_LOOP )  printf( "-->exit loop i\n" );
                    loop_i_active = FALSE;
                }
                else {
                    loop_line = loop_i_first;
                    file_line -= (loop_i_last - loop_i_first + 1);
                }
            }
        }
    }
    do_error( "read file: max commands exceeded, possible loop error" );
    return( 0 );
}


/*------------------process a single line, read and crack-------------------*/

int do_line( FILE *fp, char command[FIELD_LEN+1], int *pnargs,
            char args[MAX_ARGS+1][FIELD_LEN+1], int *pfile_line,
            int loop_i_active, char loop_buffer[MAX_LOOP+1][LINE_LEN+1],
            int *ploop_line )
{
    static char line_buffer[LINE_LEN+1];
    char buffer[LINE_LEN+1];
    int i, ret;
    static int len;

    command[0] = '\0';
                             /*  first check for multiple fields on a line  */
    if( buffer_ptr ) {
        ret = len - buffer_ptr;
        strcpy( buffer, line_buffer + buffer_ptr );
        ret = len - buffer_ptr;
        if( DEBUG_IF || DEBUG_LOOP )  printf( "    field= %s\n", buffer );
    }
                             /*  check for loop input, all loops  */
    else if( loop_i_active ) {
        strcpy( buffer, loop_buffer[*ploop_line] );
        strcpy( line_buffer, buffer );
        /* if( DEBUG_LOOP )  printf( "loop line=%d, ind i=%g, ind j=%g  ind k=%g  buff=%s\n", loop_line, loop_i_index, loop_j_index, loop_k_index, buffer ); */
        *ploop_line += 1;
        if( !nocount )  *pfile_line += 1;
        len = ret = strlen( buffer );
    }

    else {                                /*  normal input from file  */
        ret = fgetstr( fp, line_buffer, LINE_LEN );
        if( DEBUG_IF || DEBUG_LOOP )  printf( "read line= %s\n", line_buffer );
        len = ret;
        strcpy( buffer, line_buffer );
        *pfile_line += 1;
    }

    if( ret == EOF )  return( 0 );        /*  end of file detected here  */

                                          /*  blank line  */
    if( ret == 0 ) {
        buffer_ptr = 0;
        return( NOOP );
    }

    if( DEBUG_INP )  printf( "   do_line: processing <%s> len=%d\n", buffer, ret );

                                          /*  handle run-on lnes here  */
    for( ;; ) {
        /*  drop trailing blanks  */
        for( i = strlen( buffer )-1; i > 0; i-- ) {
            if( buffer[i] == ' ' )  buffer[i] = '\0';
            else  break;
        }
        if( DEBUG_INP )  printf( "   do_line: drop blanks: <%s> len=%d\n", buffer, len );
        
        /*  combine run-on lines  */
        if( buffer[strlen(buffer)-1] == '\\' ) {
            buffer[strlen(buffer)-1] = '\0';
            if( loop_i_active ) {
                strcpy( line_buffer, loop_buffer[*ploop_line] );
                /* if( DEBUG_LOOP )  printf( "loop line=%d, ind i=%g, ind j=%g  ind k=%g  buff=%s\n", loop_line, loop_i_index, loop_j_index, loop_k_index, buffer ); */
                *ploop_line += 1;
                if( !nocount )  *pfile_line += 1;
			}
            else {
				ret = fgetstr( fp, line_buffer, LINE_LEN );
				len += ret;
                *pfile_line += 1;
			}
            
            /*  delete leading spaces  */
            for( i = 0; i <= LINE_LEN; i++ ) {
                if( line_buffer[i] != ' ' )  break;
            }
            strcat( buffer, line_buffer+i );
        }
        else  break;
        if( DEBUG_INP )  printf( "   do_line: concat: <%s> len=%d, new len=%d\n", buffer, ret, len );
    }

    /*  make a global copy of the buffer for possible further processing  */
    strcpy( g_line_buffer, buffer );

                                          /*  do command  */

    ret = item( 1, command, FIELD_LEN, buffer, LINE_LEN );

                                          /*  handle "exec" commands here  */
    if( !strcmp( command, "exec" ) && !jump ) {
        ret = item( 2, stmp, FIELD_LEN, buffer, LINE_LEN );
        if( stmp[0] != '$' )  do_error( "exec command needs a string variable argument" );
        lookup_user_var( stmp );
        strcpy( buffer, gstring );
        ret = item( 1, command, FIELD_LEN, buffer, LINE_LEN );
        if( debug )  printf( "exec:\n" );
    }

                                          /*  no command field  */
    if( ret == -1 ) {
        buffer_ptr = 0;
        if( comment_active && !comment_line )  comment_line = *pfile_line;
        if( !comment_active )  comment_line = 0;
        return( NOOP );
    }
                                          /*  do args  */
    for( i = 1; i <= MAX_ARGS; i++ ){
        ret = item( i+1, args[i], FIELD_LEN, buffer, LINE_LEN );
        if( DEBUG_INP )  printf( "   %s--> field %d, item returned %d, item = %s\n", command, i, ret, args[i] );
        if( ret == -2 )  break;
        if( ret == -1 ) {
            buffer_ptr = 0;
            break;
        }
    }
    *pnargs = i - 1;

    if( comment_active && !comment_line )  comment_line = *pfile_line;
    if( !comment_active )  comment_line = 0;

    return(1);
}


/*  --------------------find nth item in a command line ------------------------- */
/*  delim chars: spaces, but ' = 's are ignored between commands and arg1 */
/*     use quotes to include these guys in an argument  */
/*  terminate chars: EOL   #   "//"   "/*"  ;           */
/*  all other characters are valid arg components       */

int item( int n, char *item, int item_len, char *buffer, int buffer_len )
{
    int i, j, k, kk, m, space = 1, begin=0, quotes=0, quotes2=0;
    int index;
    double val;
    char stmp[129], indstr[6];

    m = 0;
    item[0] = '\0';

    /*  search for beginning of desired field  */
    for( i = 0; i <= buffer_len-1; i++ ) {

        /*  check for quoted fields  */
        if( buffer[i] == '"' ) {
            quotes = !quotes;
        }

        /*  check for end of field, multiple commands on line  */
        if( !quotes && buffer[i] == ';' ) {
            if( buffer[i+1] == '\0' || comment_active )  return( -1 );
            buffer_ptr += i+1;
            return( -2 );
        }

        /*   check for in-line comments */
        if( !quotes && (buffer[i] == '#' || (buffer[i] == '/' && buffer[i+1] == '/' ) ||
            buffer[i] == '\0') ) {
            return( -1 );
        }

        /*  check for multi-line comment  */
        if( comment_active ) {
            if( (buffer[i] == '/' && buffer[i+1] == '*' ) ) printf( "WARNING:  nested comments\n" );
            if( (buffer[i] == '*' && buffer[i+1] == '/' ) ) {
                comment_active = FALSE;
                i++;
            }
            continue;
        }

        if( !quotes && (buffer[i] == '*' && buffer[i+1] == '/' ) ) {
            printf( "Warning: orphan end comment, ignored\n" );
            i++;
            continue;
        }
        if( !quotes && (buffer[i] == '/' && buffer[i+1] == '*' ) ) {
            comment_active = TRUE;
            continue;
        }

		/*  check for illegal use of an = sign 
        if( !quotes && (buffer[i-1] != ' ' && buffer[i] == '=' && buffer[i+1] == ' ') ||
            (buffer[i-1] == ' ' && buffer[i] == '=' && buffer[i+1] != ' ') ) {
			printf( "%s\n", buffer );
            do_error( "Illegal use of an = sign, must have zero or two adjacent spaces" );
            continue;
        }
		*/

        /*  null characters - note = or + followed or preceded by space  */
        if( !quotes && (buffer[i] == ' ' || (buffer[i] == '=' && buffer[i+1] == ' ') ||
			(buffer[i] == ' ' && buffer[i+1] == '=')  ||
            (buffer[i] == '+' && buffer[i+1] == ' ')  ||
			(buffer[i] == ' ' && buffer[i+1] == '+')  || buffer[i] == '\t') ) {
            space = 1;
            continue;
        }

        /*  found a valid character  */
        else {
            if( space ) {
                space = 0;
                m++;
                if( m == n ) {       /*  found the field  */          
                    begin = i;
                    if( quotes )  begin++;
                    break;
                }
            }
        }
    }

    /*  look for end of arg, quoted  */

    if( quotes ) {
        for( i = begin, j = 0; i <= buffer_len-1; i++, j++ ){  
            if( (j == item_len) || (buffer[i] == '"') ) {		
                item[j] = '\0';
                return(1);
            }
            else {
                item[j] = buffer[i];
                if( buffer[i] == '\0' ) {
                    printf( "==>(item error) Unpaired quotes found in arg %d: %s\n\n", n-1, item );
                    do_exit(2);
                }
            }
        }
    }

    /*  look for end of arg, unquoted, note '=' is omitted as a delimiter  */
    else {
        for( i = begin, j = 0; i <= buffer_len-1; i++, j++ ){

			/*  handle embedded quotes, no processing!  */
			if( quotes2 ) {
				item[j] = buffer[i];
				if( item[j] == '"' )  quotes2 = FALSE;
                if( buffer[i] == '\0' ) {
                    printf( "==>(item error) Unpaired quotes found in arg %d: %s\n\n", n-1, item );
                    do_exit(2);
                }
				continue;
			}
            
            /*  check for indexed fields, but not in jumps!  */
            /*    (during a jump, not all variables are defined)  */
            if( buffer[i] == '[' && !jump ) {
                for( k = i+1, kk = 0; kk <= 128; k++, kk++ ) {
                    if( buffer[k] == '[' ) {
                        printf( "Nested indices not allowed: %s", buffer );
                        do_exit(2);
                    }
                    if( buffer[k] == ']' ) {
                        stmp[kk] = '\0';
                        break;
                    }
                    if( buffer[k] == ' ' || buffer[k] == '\0' )  do_error( "index error: (end of field) closing bracket not found" );
                    stmp[kk] = buffer[k];
                }
				if( kk == 129 ) {
					do_error( "index error: (overflow) closing bracket not found" );
				}
                index = exptoi( stmp );            /*  index computed here  */
                sprintf( indstr, "%d", index );
                item[j] = '\0';
                sprintf( stmp, "%s[%s]", item, indstr );
                strcpy( item, stmp );
                j += strlen( indstr ) + 1;
                i = k;
            }
			/*  check for end  */
            else if( (j == item_len) || buffer[i] == ' ' || buffer[i] == ';' || 
                buffer[i] == '\0' || (buffer[i] == '/' && buffer[i+1] == '/' ) 
                || buffer[i] == '#' || buffer[i] == '\t' ) {
                
                item[j] = '\0';

                /*  done, now check for @ fields, but not in jumps!  */
                if( item[0] == '@' && !jump ) {
                    val = exptof( item+1 );
                    if( item[1] != '$' ) {
                        if( field_width ) {
                            if( decimals >= 0 )  sprintf( item, "%*.*f", field_width, decimals, val );
                            else if( decimals < -1 )  sprintf( item, "%*.*e", field_width, -decimals, val );
                            else if( decimals == -1 )  sprintf( item, "%*g", field_width, val );
                        }
                        else {
                            if( decimals >= 0 )  sprintf( item, "%.*f", decimals, val );
               
						else if( decimals < -1 )  sprintf( item, "%.*e", -decimals, val );
                            else if( decimals == -1 )  sprintf( item, "%g", val );
                        }
                    }
                    else                    strcpy( item, gstring );
                }
                return(1);
            }
			/*  check if in comment field  */
            else if( comment_active ) {
                if( (buffer[i] == '/' && buffer[i+1] == '*' ) ) printf( "WARNING:  nested comments\n" );
                if( buffer[i] == '*' && buffer[i+1] == '/' ) {
                    comment_active = FALSE;
                    i++;
                }
                continue;
            }
			/*  check for end of comment  */
            else if( buffer[i] == '*' && buffer[i+1] == '/'  ) {
                printf( "Warning: orphan end comment, ignored\n" );
                i++;
                continue;
            }
			/*  check for comment  */
            else if( buffer[i] == '/' && buffer[i+1] == '*' ) {
                comment_active = TRUE;
                i++;
                continue;
            }
            else {
				/*  store the current char  */
                item[j] = buffer[i];

                /*  handle escape sequences  */
                if( buffer[i] == '\\' ) {
                    i++;
                    if( buffer[i] == 't' )  item[j] = '\t';
                    else if( buffer[i] == 'n' )  item[j] = '\n';
                    else if( buffer[i] == '\\' ) item[j] = '\\';
                    else if( buffer[i] == '"' )  item[j] = '\"';
                    else if( buffer[i] == '\'' ) item[j] = '\'';
                    else if( buffer[i] == '0' ) item[j] = '\0';
                    else  do_error( "parse-item - unknown escape sequence" );
                }
				/*  check for internal quote field  */
				if( buffer[i] == '"' ){
					quotes2 = TRUE;
				}
            }
        }
    }
    return( 0 );
}


/*------------------ utility to advance to one of three commands            */
/*                   returns 1, 2 or 3 if command is found, error if not    */
/*                   if check_depth, command must be at if_depth of origin  */
/*                   uses global variables for the current command and args */

int jump_to( FILE *fp, char command1[FIELD_LEN+1], char command2[FIELD_LEN+1],
            char command3[FIELD_LEN+1], int check_depth, int *pfile_line,
            int *ploop_i_active, int *ploop_j_active, int *ploop_k_active,
            char loop_buffer[MAX_LOOP+1][LINE_LEN+1], int *ploop_line, int *pif_depth )
{
    int i, ret, depth0;

    jump = TRUE;
    depth0 = *pif_depth;

    if( DEBUG_IF || DEBUG_LOOP )  printf( "++++++++jumping to %s++++++++\n", command1 );
    if( DEBUG_IF )  printf( "    jump:  orig if level = %d\n", depth0 );

    for( i = 1; i <= MAX_LINES;  i++ ) {
         
        /*  NOTE:  the test command and args are globals  */

        ret = do_line( fp, g_command, &g_nargs, g_args, pfile_line, *ploop_i_active, loop_buffer, ploop_line );

        /* if( DEBUG_IF || DEBUG_LOOP )  printf( "jump command=%s, depth=%d\n", g_command, *pif_depth ); */

        if( !ret ) {            /*   EOF   */
            fclose( fp );
            sprintf( stmp, "jump error,  command  <%s>  is missing or  end_if  problem", command1 );
            do_error( stmp );
            jump = FALSE;
            return( 0 );
        }
        else if( ret == NOOP || comment_active ) continue;

        if( !check_depth )  depth0 = *pif_depth;

                                                /*  tests here  */
        if( !strcmp( g_command, command1 ) && *pif_depth == depth0 )  {
            if( DEBUG_IF )  printf( "    Jump1 to  %s  done\n", command1 );
            jump = FALSE;
            return( 1 );
        }
        else if( command2[0] != '\0' && !strcmp( g_command, command2 ) && *pif_depth == depth0  )  {
            if( DEBUG_IF )  printf( "    Jump2 to  %s  done\n", command2 );
            jump = FALSE;
            return( 2 );
        }
        else if( command3[0] != '\0' && !strcmp( g_command, command3 ) && *pif_depth == depth0  )  {
            if( DEBUG_IF )  printf( "    Jump3 to  %s  done\n", command3 );
            jump = FALSE;
            return( 3 );
        }
                                                /*  depth adjustments  */
        if( !strcmp( g_command, "if" ) && g_nargs == 1 ) {
            (*pif_depth)++;
            if( DEBUG_IF )  printf( "    jump (if):  if level now = %d\n", *pif_depth );
        }
        if( !strcmp( g_command, "end_if" ) ) {
            (*pif_depth)--;
            if( DEBUG_IF )  printf( "    jump (end_if):  if level now = %d\n", *pif_depth );
        }
        if( !strcmp( g_command, "end_loop_k" ) || !strcmp( g_command, "end_k" ) )  *ploop_k_active = FALSE;
        if( !strcmp( g_command, "end_loop_j" ) || !strcmp( g_command, "end_j" ) )  *ploop_j_active = FALSE;
        if( !strcmp( g_command, "end_loop_i" ) || !strcmp( g_command, "end_i" ) )  *ploop_i_active = FALSE;
    }

    do_error( "Jump_error:  command not found" );
    return( 0 );
}
