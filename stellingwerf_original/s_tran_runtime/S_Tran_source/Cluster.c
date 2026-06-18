/*  clust.c - diagonalize the correlation matrix  */
/* $Id: clust.c,v 1.9 2001/05/16 20:16:10 rfs Exp rfs $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  rfs - 9/97  */
/*  rfs - 5/04 - port to "S"  */

/*  this is a stand-alone package, no libraries are required  */
/*  test version for small data sets, in-line version possible  */

/*
purpose:  unsupervised multivariate clustering
usage:    clust file [sens [debug]]
          sens is the sensitivity parameter (0-1) [0.5]
            results in small -> large number of clusters
            if sens < 0, suppress iterative improve
          debug = 1-3 for debug

  
    Picks points at random, starts with overall sigma to pick clusters,
        imputes actual cluster sizes and distances on the fly.
    Then iterates to get a consistent set with new k
        ->  make sure each point is in the correct cluster
        ->  move points as needed
        ->  drop clusters if no points
        ->  update cluster centers, iterate
    sens (input) determines the number of clusters
        0 -> min clusts
        1 -> max clusts

    xij = data

    x_mean[j] = mean of jth variable
    x_var[j]  = variance of jth variable
    x_sig[j]  = sqrt( x_var[j] )

    data_sig = overall sigma of all standardized data points
    data_var = sq( data_sig )

    dist_p = max( mean cluster dist ) = max cluster size
    dist_c = average of min dist between clusters = avg dist to closest clust
    dratio = dist_c / dist_p

    sig_p = stdev of all points about their cluster centers
    sig_c = stdev of all cluster centers
    sratio = sig_c / sig_p
    var_p = sq( sig_p )
    var_c = sq( sig_c )
*/

#define EXTERN extern
#include "s_tran.h"
                                                /*  prototypes  */

static double dist( int n, double v1[], double v2[] );
static int rand_list( int n, int v[] );
static int standardize( void );
static int disp_c( void );
static int anal_c( void );
static int iter( void );
static int write_data( void );

#define MAXN  50                                /*  max variables  */
#define MAXM  10000                             /*  max data pts  */
#define MAXC  100                               /*  max clusters  */

static double x0[MAXM+1][MAXN+1];                      /*  data  */
static double x[MAXM+1][MAXN+1];                       /*  data - standardized */
static int order[MAXM+1];                              /*  pick order  */
static int nclus[MAXM+1];                              /*  data cluster  */
static int count[MAXN+1];                              /*  # var values  */
static int ccount[MAXC+1][MAXN+1];                     /*  # cluster var values  */
static double cmean[MAXC+1][MAXN+1];                   /*  cluster means  */
static int num_mem[MAXC+1];                            /*  # members  */
static double vx[MAXN+1], vm[MAXN+1];                  /*  scratch vectors  */
                                                /*  cluster sizes  */
static double max_dist[MAXC+1], mean_dist[MAXC+1];

static double cdist[MAXC+1], ccmean[MAXN+1];
static double x_mean[MAXC+1], zero[MAXC+1], x_var[MAXC+1], x_sig[MAXC+1], data_sig, data_var;
static double dist_p, dist_c, dratio;
static double sig_c, sig_p, var_p, var_c, sratio;
static int ndat, nvar, nmiss, nblanks, nquest, num_clus, no_iter;
static char work_file[51];
static char out_file[81];

static double sens = 0.5;

static int debug = 0, changes;

extern int na, ne, set_tol;
extern double tol1;
extern char Labels[MAX_FIELDS+1][FIELD_LEN+1];
extern double xx[MAX_LINES+1][MAX_FIELDS+1];

/*  globals for results  */
int Clusters;
double Variance;


int cluster( )
{
    int i, j, ii, ic, join, tot_changes;
    double dm, mind, cdist;

    if( set_tol ) {
        sens = tol1;
    }
    sens = fmin( sens, 1.0 );
    sens = fmax( sens, 0.0 );
    nvar = na;
    ndat = ne;

    nmiss = 0;
    for( i = 1; i <= ndat; i++ ) {
        for( j = 1; j <= nvar; j++ ) {
            x0[i][j] = xx[i][j];
            if( x0[i][j] == MISS )  nmiss++;
        }
    }

    standardize();
                                                /*  print problem summary  */

    printf( "\nCLUST.C:  variables = %d,  data pts = %d,   sens = %g\n", nvar, ndat, sens );
    printf( "    Total data fields = %d, missing = %d (%.2f%%)\n", nvar * ndat, nmiss, 100.*nmiss/(ndat*nvar) );

                                                /*  initialize order  */
    for( i = 1; i <= ndat; i++ ) {
        order[i] = i;
    }
                                                /*  randomize order  */
    rand_list( ndat, order );

/*------------------------------- compute ---------------------------------*/

    for( ii = 1; ii <= ndat; ii++ ) {

        i = order[ii];
                                                /*  new point  */

        for( j = 1; j <= nvar; j++ )  vx[j] = x[i][j];

                                                /*  initialize process  */
        if( ii == 1 ) {
            if( debug )  printf( "First point %d...\n", i );
            nclus[i] = 1;
            num_mem[1] = 1;
            num_clus = 1;
            for( j = 1; j <= nvar; j++ )  cmean[1][j] = vx[j];

            dist_c = data_sig * ( 1.1 - sens );
            dist_p = 0.;

            continue;
        }
                                                /*  closest clust=ic */

        if( debug )  getchar();
        if( debug )  printf( "Step %d Add point %d...\n", ii, i );
        for( j = 1, ic = 1; j <= num_clus; j++ ) {
            dm = dist( nvar, vx, cmean[j] );

            if( debug >= 2 )  printf( "   dist to mean %d = %g (mem=%d)\n", j, dm, num_mem[j] );

            if( j == 1 )  mind = dm;
            else if( dm < mind ) {
                mind = dm;
                ic = j;
            }
        }
        if( debug )  printf( "      nearest = %d, dm = %g\n", ic, mind );

                                                /*  logic here  */
        cdist = dist_p;

        if( num_clus == MAXC )    join = TRUE;
        else if( mind > dist_c )  join = FALSE;
        else if( mind < cdist )   join = TRUE;
        else {
            if( mind < (1. - sens) * dist_c + sens * cdist )  join = TRUE;
            else                                              join = FALSE;
        }
                                                /*  new cluster  */
        if( !join ) {
            num_clus++;
            dist_c = ((num_clus - 1) * dist_c + mind) / num_clus;
            num_mem[num_clus] = 1;
            nclus[i] = num_clus;
            for( j = 1; j <= nvar; j++ )  cmean[num_clus][j] = vx[j];
            if( debug )  printf( "        form new cluster # %d\n", num_clus, i );
        }
                                                /*  join cluster  */
        else {
            nclus[i] = ic;
            num_mem[ic]++;
            max_dist[ic] = fmax( cdist, mind );
            mean_dist[ic] = ((num_mem[ic] - 1) * mean_dist[ic] + mind) / num_mem[ic];

            for( j = 1; j <= nvar; j++ ) {
                if( vx[j] != MISS && cmean[ic][j] != MISS ) {
                    cmean[ic][j] = ((num_mem[ic] - 1) * cmean[ic][j] + vx[j]) / num_mem[ic];
                }
                else if( cmean[ic][j] == MISS )  cmean[ic][j] = vx[j];
            }

            dist_p = 0.;
            for( i = 1; i <= num_clus; i++ ) {
                dist_p = fmax( dist_p, mean_dist[i] );
            }

            if( debug )  printf( "        add point to cluster # %d, size = %g\n", ic, max_dist[ic] );
        }
        if( debug )  printf( "        dist_p=%g,  dist_c=%g, sens=%g\n", dist_p, dist_c, sens ); 
    }

                                                /*  output  */
    printf( "\nClusters = %d\n", num_clus );
    /* printf( "        dist_p = %g,  dist_c = %g, ratio = %g\n", dist_p, dist_c, dist_c / dist_p ); */
    anal_c();
    disp_c();

    /* getchar(); */

                                                /*  iterative improvement  */
    if( !no_iter ) {
        tot_changes = 0;    
        for( i = 1; i <= 25; i++ ) {
            iter();
            printf( "Iteration %d: %d changes\n", i, changes );
            anal_c();
            tot_changes += changes;
            if( !changes ) {
                break;
            }
        }
        if( tot_changes ) {
            printf( "\nClusters = %d\n", num_clus );
            disp_c();
        }
    }
                                                /*  write result  */
    write_data();
    printf( "Results written to %s\n", out_file );

    return( 1 );
}


/*---------compute standard stats --------------------*/

standardize()
{
    int i, j;
    double dd;
                                               /*  standardize  */
    for( j = 1; j <= nvar; j++ ) {
                                                /*  do means  */
        count[j] = 0;
        for( i = 1; i <= ndat; i++ ) {    
            if( x0[i][j] != MISS ) {
                x_mean[j] += x0[i][j];
                count[j]++;
            }
        }
        if( count[j] )  x_mean[j] /= count[j];
        else            x_mean[j] = MISS;
                                                /*  do vars & sd's  */
        count[j] = 0;
        for( i = 1; i <= ndat; i++ ) {    
            if( x0[i][j] != MISS && x_mean[j] != MISS ) {
                x_var[j] += sq( x0[i][j] - x_mean[j] );
                count[j]++;
            }
        }
        if( count[j] ) {
            x_var[j] /= count[j];
            x_sig[j] = sqrt( x_var[j] );
        }
        else {
            x_var[j] = MISS;
            x_sig[j] = MISS;
        }
        if( debug )  printf( "Variable %d = %s  mean=%g  sigma=%g\n", j, Labels[j], x_mean[j], x_sig[j] );

                                                /*  standardize  */
        for( i = 1; i <= ndat; i++ ) {    
            if( x0[i][j] != MISS && x_mean[j] != MISS && x_sig[j] != MISS ) {
                x[i][j] = (x0[i][j] - x_mean[j]) / x_sig[j];
            }
            else {
                x[i][j] = MISS;
                if( debug >= 2 )  printf( "...variable %d / %d MISSING\n", i, j );
            }
        }
    }
    printf( "   All variables standardized for analysis\n" );

                                                /*  compute data stats  */
    for( i = 1; i <= ndat; i++ ) {    
        dd = dist( nvar, x[i], zero );
        data_var += sq( dd );
    }
    data_var /= ndat;
    data_sig = sqrtc( data_var );
    printf( "Data sigma = %g, variance = %g\n", data_sig, data_var );
   
    return(1);
}

/*----------------------------------------- iterate ------------------*/

iter()
{
    int i, j, k, ic, single, ipt;
    double dm, mind;
                                                /*  check min dist  */
    changes = 0;
    for( i = 1; i <= ndat; i++ ) {
        single = FALSE;
        for( j = 1; j <= nvar; j++ )  vx[j] = x[i][j];
        for( j = 1, ic = 1; j <= num_clus; j++ ) {
            if( num_mem[j] == 1 && j == nclus[i] ) {
                single = TRUE;
                continue;
            }
            dm = dist( nvar, vx, cmean[j] );
            if( j == 1 )  mind = dm;
            else if( dm < mind ) {
                mind = dm;
                ic = j;
            }
        }
        if( ic != nclus[i] ) {
            ipt = nclus[i];
                                                /*  move singles if mind is 
                                                less than mean inter-clus dist  */

            if( !single || mind < dist_c ) {
                if( debug )  printf( "----->iter point %d in clus %d moved to clus %d\n", i, ipt, ic );
                changes++;
                nclus[i] = ic;
                num_mem[ic]++;
                num_mem[ipt]--;
                if( num_mem[ipt] == 0 ) {
                    for( k = 1; k <= ndat; k++ ) {
                        if( nclus[k] > ipt ) {
                            nclus[k]--;
                        }
                    }
                    num_clus--;
                    for( k = ipt; k <= num_clus; k++ ) {
                        num_mem[k] = num_mem[k+1];
                    }
                    printf( "- - - - - ->iter: drop clus %d, num_clus=%d\n", nclus[i], num_clus );
                }
            }
        }
    }
    return(1);
}


/*------------------------recompute--------------------------------*/
/*  compute everything from num_clus and nclus[]  */

anal_c()
{
    int i, j, ic, ncheck, first;
    double dd;

                                                /*  cluster means  */
    for( i = 1; i <= num_clus; i++ ) {
        num_mem[i] = 0;
        for( j = 1; j <= nvar; j++ ) {
            cmean[i][j] = 0.;
            ccount[i][j] = 0;
        }
    }
    for( i = 1; i <= ndat; i++ ) {
        ic = nclus[i];
        if( ic <= 0 || ic > num_clus ) {
            printf( "ERROR: point %d has cluster # %d\n", i, ic );
            do_exit(1);
        }
        num_mem[ic]++;
        for( j = 1; j <= nvar; j++ ) {
            if( x[i][j] != MISS ) {
                cmean[ic][j] += x[i][j];
                ccount[ic][j]++;
            }
        }
    }
    for( i = 1, ncheck = 0; i <= num_clus; i++ ) {
        for( j = 1; j <= nvar; j++ ) {
            if( ccount[i][j] )  cmean[i][j] /= ccount[i][j];
            else                cmean[i][j] = MISS;
        }
        ncheck += num_mem[i];
        if( num_mem[i] <= 0 ) {
            printf( "ERROR: cluster %d has %d members\n", i, num_mem[i] );
            do_exit(1);
        }
    }
    if( ncheck != ndat )  printf( "\n***Warning: check=%d NE ndat=%d***\n", ncheck, ndat );

                                                /*  cluster sigma  */
    for( j = 1; j <= nvar; j++ ) {
        ccmean[j] = 0.;
        count[j] = 0;
    }
    for( i = 1; i <= num_clus; i++ ) {
        for( j = 1; j <= nvar; j++ ) {
            if( cmean[i][j] != MISS ) {
                ccmean[j] += cmean[i][j];
                count[j]++;
            }
        }
    }
    for( j = 1; j <= nvar; j++ ) {
        if( count[j] )  ccmean[j] /= count[j];
        else            ccmean[j] = MISS;
    }

    var_c = 0.;
    for( i = 1; i <= num_clus; i++ ) {
        dd = dist( nvar, ccmean, cmean[i] );
        var_c += sq( dd );
    }
    var_c /= num_clus;
    sig_c = sqrtc( var_c );
                                                /*  between clusts  */
    dist_c = 0.;
    for( i = 1; i <= num_clus; i++ ) {
        max_dist[i] = 0.;
        mean_dist[i] = 0.;
        first = 1;
        for( j = 1; j <= num_clus; j++ ) {
            if( i == j )  continue;
            if( first )  dd = dist( nvar, cmean[i], cmean[j] );
            else         dd = fmin( dd, dist( nvar, cmean[i], cmean[j] ) );
            first = 0;
        }
        cdist[i] = dd;
        dist_c += dd;
    }
    dist_c /= num_clus;
                                                /*  within clusts  */
    var_p = 0.;
    for( i = 1; i <= ndat; i++ ) {
        for( j = 1; j <= nvar; j++ )  vx[j] = x[i][j];
        ic = nclus[i];
        dd = dist( nvar, vx, cmean[ic] );
        max_dist[ic] = fmax( max_dist[ic], dd );
        mean_dist[ic] += dd;
        var_p += sq( dd );
    }
    var_p /= ndat;
    sig_p = sqrtc( var_p );

    dist_p = 0.;
    for( i = 1; i <= num_clus; i++ ) {
        mean_dist[i] /= num_mem[i];
        dist_p = fmax( dist_p, mean_dist[i] );
    }
    dratio = dist_c / dist_p;
    sratio = sig_c / sig_p;
    return(1);
}


/*----------------------display summary-------------------------------*/

disp_c()
{
    int i, j;
    double tmp, tmp2, correct;
                                                /*  print last iter  */
    for( i = 1; i <= num_clus; i++ ) {
        if( num_mem[i] == 1 ) {
            for( j = 1; j <= ndat; j++ ) {
                if( nclus[j] == i )  break;
            }
            printf( "cluster %2d  mem= %3d  dist=%6.3f point= %d\n", i, num_mem[i], cdist[i], j );
        }
        else
            printf( "cluster %2d  mem= %3d  dist=%6.3f size=%6.3f / (max)%6.3f\n", i, num_mem[i], cdist[i], mean_dist[i], max_dist[i] );
    }
    printf( "    dist_p= %6.3f, dist_c = %6.3f, ratio = %6.3f\n", dist_p, dist_c, dratio );
    printf( "    sig_p = %6.3f, sig_c  = %6.3f, ratio = %6.3f\n", sig_p, sig_c, sratio );
    correct = (double)ndat / (ndat - num_clus);
    tmp = 100.*(1. - var_p / data_var);
    tmp2 = tmp / correct;
    printf( "    var_p = %6.3f, var_dat= %6.3f, ratio(w dof corr)= %6.3f\n", var_p, data_var, data_var / (correct * var_p) );
    printf( "    %% variance explained = %6.3f, (w dof corr = %6.3f)\n\n", tmp, tmp2 );

    Clusters = num_clus;
    Variance = tmp2;
    return(1);
}



write_data()   /*------------------------- CDAT interface -------------------*/
{
    FILE *fpr;
    int i, j, n, m;

    sprintf( out_file, "clus.cd" );
    m = ndat + num_clus;
    n = nvar + 1;

    if( !(fpr = fopen( out_file, "w" )) ) {
        printf( "Error in opening file %s\n", out_file );
        do_exit(1);
    }

    fprintf( fpr, "means=1-%d, data=%d-%d\n", num_clus, num_clus+1, m );  /*  write header  */
                                             
    fprintf( fpr, "%d %d ", m, -n );            /*  write ne, na  */

    for( j = 1; j <=  n; j++ ) {                /*  write att lens  */
        fprintf( fpr, " -1" ); 
    }
    fprintf( fpr, "\n" );
                                                /*  two parameters  */
    fprintf( fpr, "2\nClusters\n%d\n", num_clus );
    fprintf( fpr, "TYPE2\n%d\n", num_clus+1 );

    for( j = 1; j <= n-1; j++ ) {               /*  write attribute labels  */
        fprintf( fpr, "%s\n", Labels[j] );
    }
    fprintf( fpr, "Cluster\n " ); 
                                                /*  write cluster locations  */
                                        /*  convert to unstandardized units  */

    for( i = 1; i <= num_clus; i++ ) {    
        for( j = 1; j <= n-1; j++ ) {
            if( x_mean[j] == MISS ) {
                  fprintf( fpr, "\n" );
            }
            else  fprintf( fpr, "%g\n", x_sig[j] * cmean[i][j] + x_mean[j] );
        }
        fprintf( fpr, "%d\n", i );
    }
                                                /*  write all data values  */ 
    for( i = 1; i <= ndat; i++ ) {    
        for( j = 1; j <= n-1; j++ ) {
            if( x0[i][j] == MISS ) {
                  fprintf( fpr, "\n" );
            }
            else  fprintf( fpr, "%g\n", x0[i][j] );
        }
        fprintf( fpr, "%d\n", nclus[i] );
    }
    fclose( fpr );
    return(1);
}


/* ------------------- metric - Euclidean in N dimensions - assume standard vars  */

double dist( int nn, double v1[], double v2[] )
{
    int i;
    double dd;

    dd = 0.;
    for( i = 1; i <= nn; i++ ) {
        if( v1[i] != MISS && v2[i] != MISS )  dd += sq( v1[i] - v2[i] );
    }
    dd = sqrtc( dd );

    return( dd );
}


/* ----------------------------------------------------randomize vector in ints  */

int rand_list( int n, int v[] )
{
    int i, i1, i2, nswap, itmp;

    nswap = 10 * n;

    for( i = 1; i <= nswap; i++ ) {
        i1 = iran( 1, n );
        i2 = iran( 1, n );
        itmp = v[i1];
        v[i1] = v[i2];
        v[i2] = itmp;
    }

    return(1);
}

