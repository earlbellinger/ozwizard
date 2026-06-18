/*  csv.c - routines needed to read and write csv files  */
/*  $Id$  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>

#define EXTERN extern
#include "s_tran.h"

/*--------------------------------------------------------
===public functions====

Called from process_cmds()/command.c

set_delim() - change delimiter character
active file() - look up file in list
close_csv_file() - close the file

    ----namelist functions----
write_vars() - namelist write fn
write_vars_str() - general write fn
read_var0() - general read fn
read_vars() = mamelist read fn

    ----write table functions---
write_csv_header()
write_csv_data()
write_csv_data_2() - do full array

    ----read table functions---
read_csv_header()
read_csv_data()

item_dat() - csv file line parser
----------------------------------------------------------*/

/*----private functions----*/

static int find_file( char *file );
static int open_file( char *file, char *rw, int renew );
static int close_file2( int nf );

/*----private data----*/

#define NFILES 100

static char delim = ',', csv_file[LINE_LEN+1], var_file[LINE_LEN+1];
static int num_fields, num_files, num_csv_files, current_csv_file;

/*-----------------------------------------------
  file handler - add each new file to the list
      open it for write or read, leave open
      look up file for each write
------------------------------------------------*/

static char file_name[NFILES+1][FIELD_LEN+1], mode[NFILES+1][3];
static FILE *fp[NFILES+1];
static int nf_csv_read, nf_csv_write[NFILES+1];       /*  csv file numbers  */
static int delim_has_been_reset;


/*========public functions=============*/


/*----set_delim----*/

void set_delim( char dlm )
{
    char dlm_string[2];

    delim = dlm;
    delim_has_been_reset = TRUE;

    /*  set a user variable for use with other write commands  */
    dlm_string[0] = dlm;
    dlm_string[1] = '\0';
    register_user_var( "$Dlm", dlm_string, 0 );
    return;
}


/*----locate file in list, returns 0 if not on list  */

int find_file( char *file )
{
    int i, active_f = 0;

//printf( "   entering find_file\n" );

    /*  search  */
    if( num_files )  {
        for( i = 1; i <= num_files; i++ ) {
            if( !strcmp( file, file_name[i] ) ) {
                active_f = i;
                break;
            }
        }
    }
    i = active_f;         /*  for brevity  */
	if( debug ) {
        printf( "   find: active file = %d = %s  fp=%u\n", i, file_name[i], fp[i] );
	}

    return( active_f );
}


/*----open new or old file, add it to list, rw = "r" or "w", renew sets a new pointer  */

int open_file( char *file, char *rw, int renew )
{
    int i, active_f = 0;
    char file_path[251];

	data_error = FALSE;
    i = active_f = find_file( file );

    /*  found it, check for special cases 
        1) file may be closed (e.g. eof on read)
        2) renew flag may be set (e.g. csv label read or write)
        3) mode has changed from r to w or vice versa
    */
//printf( "entering open_file\n" );

    if( active_f ) {
        if( !fp[i] || renew || strcmp( mode[i], rw ) ) {
            if( fp[i] ) { 
                fclose( fp[i] );
				if( debug ) {
                    printf( "close file for renewal\n" );
				}

                if( file[0] != '\\' && file[1] != ':' )  sprintf( file_path, "%s%s", path_name, file );
                else  strcpy( file_path, file );
                fp[i] = fopen( file_path, rw );
				if( debug ) {
                    printf( "reopen file %s\n", file_path );
				}
                if( !fp[i] ) {
                    printf( "Cannot open data file <%s>\n", file_path );
                    data_error = TRUE;
					return(0);
                }
            }
        }
    }

    /*  new file - add it to the list and open for read or write  */
    else {
		num_files++;
        if( num_files > NFILES ) {
			printf( "Too many data files\n" );
			data_error = TRUE;
			num_files--;
			return(0);
		}
        strcpy( file_name[num_files], file );
        if( file[0] != '\\' && file[1] != ':' )  sprintf( file_path, "%s%s", path_name, file );
        else  strcpy( file_path, file );
        strcpy( mode[num_files], rw );
        fp[num_files] = fopen( file_path, rw );
        if( !fp[num_files] ) {
            printf( "Cannot open data file <%s>\n", file_path );
            data_error = TRUE;
			num_files--;
			return(0);
        }
        active_f = num_files;
		if( debug ) {
            printf( "   open succeeded, files=%d, file=%s, fp=%u\n", num_files, file_name[num_files], fp[num_files] );
		}
    }
    return( active_f );
}


/*----close a file----*/

close_csv_file( char *file )
{
    int nf, i, hit=0;

//printf( "attempt to close file %s\n", file );

    nf = find_file( file );
	data_error = FALSE;

    if( nf && fp[nf] ) {
        fclose( fp[nf] );
        if( nf == nf_csv_read )  nf_csv_read = 0;
        else if( nf_csv_read > nf )  nf_csv_read--;
		for( i = 1; i <= num_csv_files; i++ ) {
//printf( "   loop: nf=%d, ncw=%d\n", nf, nf_csv_write[i] );
            if( nf == nf_csv_write[i] ) {
				nf_csv_write[i] = 0;
				hit = 1;
			}
            else if( nf_csv_write[i] > nf ) {
				nf_csv_write[i]--;
			}
		}
		if( hit )  num_csv_files--;
        if( num_files > nf ) {
            for( i = nf+1; i <= num_files; i++ ) {
                strcpy( file_name[i-1], file_name[i] );
                strcpy( mode[i-1], mode[i] );
				fp[i-1] = fp[i];
		    	nf_csv_write[i-1] =	nf_csv_write[i];
            }
        }
        num_files--;
		if( debug ) {
            printf( "    ...file closed, num_files = %d, num_csv_files = %d\n", num_files, num_csv_files );
		}
    }
    else {
		if( debug )  printf( "   error - could not close file %s\n", file );
		data_error = TRUE;
		return(0);
	}
    return( 1 );
}


int close_file2( int nf )
{
    int i, hit=0;

    if( fp[nf] ) {
        fclose( fp[nf] );
        if( nf == nf_csv_read )  nf_csv_read = 0;
        else if( nf_csv_read > nf )  nf_csv_read--;
		for( i = 1; i <= num_csv_files; i++ ) {
            if( nf == nf_csv_write[i] ) {
				nf_csv_write[i] = 0;
				hit = 1;
			}
            else if( nf_csv_write[i] > nf )  nf_csv_write[i]--;
		}
		if( hit )  num_csv_files--;
        if( num_files > nf ) {
            for( i = nf+1; i <= num_files; i++ ) {
                strcpy( file_name[i-1], file_name[i] );
				fp[i-1] = fp[i];
                strcpy( mode[i-1], mode[i] );
            }
        }
        num_files--;
		if( debug ) {
            printf( "    ...file closed2, num_files = %d\n", num_files );
		}
    }
	else {
		if( debug )  printf( "   error:  attempt to close file %d (%s) failed\n", nf, file_name[nf] );
	}

    return( 1 );
}


/*---- write_var for namelist output, append if a file is open---- */

int write_vars( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, nf;
    double val;

    nf = open_file( file, "w", 0 );
	if( data_error )  return(0);

    for( i = 1; i<= MAX_FIELDS; i++ ) {
        if( labels[i][0] == '\0' )  break;
        val = exptof( labels[i] );
        if( labels[i][0] == '$' ) {
            fprintf( fp[nf], "%s = \"%s\"\n", labels[i], gstring );
        }
        else {
            fprintf( fp[nf], "%s = ", labels[i] );
            if( decimals >= 0 )  fprintf( fp[nf], "%.*f\n", decimals, val ); 
            if( decimals < -1 )  fprintf( fp[nf], "%.*e\n", -decimals, val );
            if( decimals == -1 ) fprintf( fp[nf], "%g\n", val );
        }
    }
    return( 1 );
}


int write_vars_str( char *file, char *str, int nl )
{
    int nf;

    nf = open_file( file, "w", 0 );
	if( data_error )  return(0);

    //printf( "write: file=%s #=%d fp=%d str=%s\n", file, nf, fp[nf], str );

    if( nl )  fprintf( fp[nf], "%s\n", str );
    else      fprintf( fp[nf], "%s", str );
    return( 1 );
}


/*----read_var for general input - default delim is blank----*/

int read_var0( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, ret;
    char field[FIELD_LEN+1], buffer[LINE_LEN+1];
    int nf;

    end_of_file = FALSE;
    nf = open_file( file, "r", 0 );
	if( data_error )  return(0);

    ret = fgetstr( fp[nf], buffer, LINE_LEN );

    if( ret == -1 ) {
        end_of_file = TRUE;
        close_file2( nf );
        return(0);
    }
    /*  special case: single string variable  */
    if( labels[1][0] == '$' && labels[2][0] == '\0' ) {
        register_user_var( labels[1], buffer, 0 );
		nfields = 1;
        return( 1 );
    }

    if( !delim_has_been_reset )  delim = ' ';  // changed 8/07 - rfs
    for( i = 1; i <= MAX_FIELDS; i++ ) {
        if( labels[i][0] == '\0' )  break;
        ret = item_dat( i, field, FIELD_LEN, buffer, LINE_LEN );
        if( ret == -1 ) {
            data_error = TRUE;         /*  too few fields  */
            nfields = i - 1;           /*  number found    */
            return( 0 );
        }
        register_user_var( labels[i], field, 0 );
    }
    nfields = i - 1;
    if( !delim_has_been_reset )  delim = ',';
    return( 1 );
}


/*----read_var for namelist input----*/

int read_vars( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, ret;
    char command[121], buffer[256];
    int nf;

    end_of_file = FALSE;
    nf = open_file( file, "r", 0 );
	if( data_error )  return(0);

    for( i = 1; i<= MAX_FIELDS; i++ ) {
        if( labels[i][0] == '\0' )  break;
        ret = fgetstr( fp[nf], buffer, LINE_LEN );
        if( ret == -1 ) {
            end_of_file = TRUE;
            close_file2( nf );
            return(0);
        }
        ret = item( 1, command, FIELD_LEN, buffer, LINE_LEN );

        if( strcmp( labels[i], command ) ) {
            printf( "Read Vars: expected var=%s, got var=%s\n", labels[i], command );
            data_error = TRUE;
			return(0);
        }
        ret = item( 2, command, FIELD_LEN, buffer, LINE_LEN );
        if( command[0] == '$' ) {
            exptof( command );
            strcpy( command, gstring );
        }
        register_user_var( labels[i], command, 0 );
    }
    return( 1 );
}


/*----write_lab for csv file----*/

int write_csv_header( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i;
    int nf;

	if( !strcmp( "<append>", labels[1] ) ) {
        nf = open_file( file, "a", 1 );
    	if( data_error )  return(0);
		num_csv_files++;
		nf_csv_write[num_csv_files] = nf;
		return(1);
	}
	else {
        nf = open_file( file, "w", 1 );
    	if( data_error )  return(0);
	}

	num_csv_files++;
    nf_csv_write[num_csv_files] = nf;
	if( debug ) {
        printf( "Num files = %d   Num csv files = %d  Curr_file = %d  fp = %u\n", num_files, num_csv_files, nf, fp[nf] );
	}
	for( i = 1; i<= MAX_FIELDS; i++ ) {
        if( labels[i][0] == '\0' )  break;
        if( i > 1 )  fprintf( fp[nf], "%c", delim );
        fprintf( fp[nf], "%s", labels[i] );
    }
    if( i == MAX_FIELDS+1 )  return( 0 );
    num_fields = i - 1;
    if( !num_fields ) {
		printf( "write_lab: no labels found\n" );
		data_error = TRUE;
		return(0);
	}
    fprintf( fp[nf], "\n" );

    return( 1 );
}


/*----write_dat----*/

int write_csv_data( double data[MAX_FIELDS+1], int num )
{
    int i;
    int nf;

	data_error = FALSE;
	current_csv_file++;
	if( current_csv_file > num_csv_files)  current_csv_file -= num_csv_files;
    nf = nf_csv_write[current_csv_file];

	if( !nf ) {
		printf( "No write file open, do a write_lab first!\n" );
		data_error = TRUE;
		return(0);
	}

    if( !fp[nf] ) {
        printf( "write_dat: File %s not open for data write\n", file_name[nf] );
		data_error = TRUE;
		return(0);
	}

    for( i = 1; i<= num; i++ ) {
        if( i > 1 )  fprintf( fp[nf], "%c", delim );
        if( data[i] == MISSING ) {
			fprintf( fp[nf], " " );
		}
		else {
            if( decimals >= 0 )  fprintf( fp[nf], "%.*f", decimals, data[i] ); 
            else if( decimals < -1 )  fprintf( fp[nf], "%.*e", -decimals, data[i] );
            else if( decimals == -1 ) fprintf( fp[nf], "%g", data[i] );
        }
    }
    fprintf( fp[nf], "\n" );
    return( 1 );
}


/*----read_lab----*/

int read_csv_header( char *file, int nargs, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, ret;
    char buffer[LINE_LEN+1];
    int nf;

    nf = open_file( file, "r", 0 );
	if( data_error )  return(0);

    nf_csv_read = nf;

    if( !fp[nf] ) {
        printf( "read_lab: File %s cannot be read\n", file_name[nf] );
		data_error = TRUE;
		return(0);
    }

    ret = fgetstr( fp[nf], buffer, LINE_LEN );
    if( ret <= 0 ) {
		printf( "read_lab:  unable to read file\n" );
		data_error = TRUE;
		return(0);
	}
    for( i = 1; i <= 1000; i++ ) {
        ret = item_dat( i, labels[i], FIELD_LEN, buffer, LINE_LEN );
        if( ret <= 0 ) {
            nfields = i - 1;
			break;
        }
    }
    end_of_file = FALSE;
    return(1);
}


/*----read_dat----*/

int read_csv_data( int nargs, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, ret;
    char buffer[LINE_LEN+1];
    int nf;

    end_of_file = FALSE;
	data_error = FALSE;
    nf = nf_csv_read;

    if( !nf ) {
		printf( "Read past end of file, check for eof!\n" );
		data_error = TRUE;
		return(0);
	}

    if( !fp[nf] ) {
        printf( "read_dat: File %s not open for data read\n", file_name[nf] );
		data_error = TRUE;
		return(0);
	}

    ret = fgetstr( fp[nf], buffer, LINE_LEN );

    if( ret == -1 ) {
        end_of_file = TRUE;
        close_file2( nf );
        nf_csv_read = 0;
        return(0);
    }

    for( i = 1; i <= 1000; i++ ) {
        ret = item_dat( i, labels[i], FIELD_LEN, buffer, LINE_LEN );
        if( ret <= 0 ) {
            nfields = i - 1;
            break;
        }
    }
    return(1);
}


/*----read_list----use for long lists----*/

int read_list( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, ret;
    char buffer[10000], item_buf[FIELD_LEN+1];
	static char old_file[51];

    int nf;

    end_of_file = FALSE;
    nf = open_file( file, "r", 0 );
	if( data_error )  return(0);

    ret = fgetstr( fp[nf], buffer, 10000 );

    if( ret == -1 ) {
        return(0);
    }

	delim = ' ';
    for( i = 1; i <= MAX_FIELDS; i++ ) {
        ret = item_dat( i, item_buf, FIELD_LEN, buffer, 10000 );
        if( ret <= 0 ) {
            nfields = i - 1;
            return( 1 );
        }
		sprintf( stmp, "$Field[%d]", i );
        register_user_var( stmp, item_buf, 0 );
    }
    return(1);
}



/*----read_dat - full matrix version----*/

int read_csv_data_2( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, j, ret, rows, cols;
    char buffer[LINE_LEN+1];
    int nf;

	nf = open_file( file, "r", 1 );
	if( data_error )  return(0);

    ret = fgetstr( fp[nf], buffer, LINE_LEN );

    if( ret == -1 ) {
        printf( "Empty data file\n" );
		data_error = TRUE;
		return(0);
	}

    /*  read label line, set number of rows  */
    for( i = 1; i <= MAX_FIELDS; i++ ) {
        ret = item_dat( i, labels[i], FIELD_LEN, buffer, LINE_LEN );

        if( ret < 0 ) {              /*  done  */
            rows = i - 1;
            sprintf( stmp, "%d", rows );
            register_user_var( "M", stmp, 0 );
            break;
        }
        else {
            sprintf( stmp, "$Labels[%d]", i );
            register_user_var( stmp, labels[i], 0 );
        }
    }

    /*  read data  */
    for( i = 1; i <= MAX_LINES; i++ ) {
        ret = fgetstr( fp[nf], buffer, LINE_LEN );
        
        /*  eof handler  */
        if( ret == -1 ) {
            fclose( fp[nf] );
            fp[nf] = NULL;
            cols = i - 1;
            sprintf( stmp, "%d", cols );
            register_user_var( "N", stmp, 0 );
            return(0);
        }
        
        for( j = 1; j <= rows; j++ ) {
            ret = item_dat( j, labels[j], FIELD_LEN, buffer, LINE_LEN );
            if( ret <= 0 ) {
                data_error = TRUE;          /*  not enough data on line  */
                nfields = j - 1;
                return(0);
            }
            sprintf( stmp, "X[%d][%d]", i, j );
            register_user_var( stmp, labels[j], 0 );
        }
        nfields = j;
    }
    return(1);
}


/*=============private functions==============*/

/*  find nth item in a .csv table row  */
/*  "item"  contains the requested field  */
/*  returns 1 = success, 0 = failure, -1 = not enough fields  */
/*  delim is a module global  */


int item_dat( int n, char *item, int item_len, char *buffer, int buffer_len )
{
    int i, j, m, quoted=0;
    LOGICAL leading = TRUE;

    m = 1;
    j = 0;
    for( i = 0; i <= buffer_len-1; i++ ) {
                                                /*  found item n  */
        if( m == n ) {
            if( buffer[i] == '\"' ) {
                quoted = !quoted;
                continue;
            }
                                                /*  blank delim, skip leading blanks  */
            else if( delim == ' ' && leading ) {
                if( buffer[i] == ' ' )  continue;
                else                    leading = FALSE;
            }
            else if( !quoted && (buffer[i] == delim || buffer[i] == '\0') ) {
                item[j] = '\0';
				if( strlen( item) == 0 )  return( -1 );
                return( 1 );
            }
            item[j] = buffer[i];
            j++;
            if( j > item_len ) {
                item[j-1] = '\0';
            }
        }
                                                /*  count to n  */
        else {
            if( buffer[i] == '\"' ) {
                quoted = !quoted;
                continue;
            }
                                                /*  blank delim, skip leading blanks  */
            else if( delim == ' ' && leading ) {
                if( buffer[i] == ' ' )  continue;
                else                    leading = FALSE;
            }
                                                /*  end of field  */
            else if( !quoted && buffer[i] == delim ) {
                leading = TRUE;
                m++;
            }
                                                /*  n too big  */
            else if( buffer[i] == '\0' ) {
                item[0] = '\0';
                return( -1 );
            }
        }
    }
    return( 0 );
}